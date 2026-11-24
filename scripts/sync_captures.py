#!/usr/bin/env python3
"""One-shot, append-only La Linia capture sync. Credentials via environment only.

Runs in GitHub Actions. It never writes a partial or conflicting event log.
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

BASE = 'https://podsveti.cz'
LOGIN = BASE + '/auth/login'
GALLERY = BASE + '/la_linia/user/captures'
OUTPUT = Path(__file__).resolve().parents[1] / 'data' / 'captures.json'
TOPOLOGY = Path(__file__).resolve().parents[1] / 'data' / 'topology.json'
PAGE_LIMIT = 100
MAX_PAGES = 100
START = datetime(2026, 11, 21, 3, 0, tzinfo=ZoneInfo('Europe/Prague'))
END = datetime(2026, 12, 5, 3, 0, tzinfo=ZoneInfo('Europe/Prague'))
FIELDS = ('id', 'datetime', 'station', 'category', 'team', 'value', 'author')


class SyncError(Exception):
    pass


def safe_url(raw: str, current: str) -> str:
    url = urljoin(current, raw)
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != 'podsveti.cz':
        raise SyncError('Odmítnuta externí nebo nezabezpečená adresa galerie.')
    return url


def login(session: requests.Session, email: str, password: str) -> None:
    page = session.get(LOGIN, timeout=30)
    page.raise_for_status()
    soup = BeautifulSoup(page.text, 'html.parser')
    forms = [f for f in soup.select('form') if f.select_one('input[type="password"]')]
    if len(forms) != 1:
        raise SyncError('Přihlašovací formulář nebyl jednoznačně nalezen.')
    form = forms[0]
    payload: dict[str, str] = {}
    found_email = found_password = False
    for field in form.select('input[name]'):
        name = field.get('name', '')
        typ = field.get('type', 'text').lower()
        if typ in ('hidden', 'submit'):
            payload[name] = field.get('value', '')
        elif typ == 'password':
            payload[name] = password
            found_password = True
        elif typ == 'email' or (typ in ('text', '') and any(k in name.lower() for k in ('mail', 'user', 'login'))):
            payload[name] = email
            found_email = True
    if not (found_email and found_password):
        raise SyncError('Nepodařilo se rozpoznat e-mailové a heslové pole.')
    action = safe_url(form.get('action') or LOGIN, page.url)
    method = form.get('method', 'POST').upper()
    if method != 'POST':
        raise SyncError('Neočekávaná přihlašovací metoda.')
    response = session.post(action, data=payload, headers={'Referer': page.url}, timeout=30)
    response.raise_for_status()
    # Definitive authentication check is performed by fetching the protected gallery.


def discover_gallery_api(html: str, page_url: str) -> str:
    soup = BeautifulSoup(html, 'html.parser')
    element = soup.select_one('[data-captures-url]')
    if not element or not element.get('data-captures-url'):
        raise SyncError('Na přihlášené galerii chybí data-captures-url. Je potřeba ověřit aktuální API webu.')
    return safe_url(element['data-captures-url'], page_url)


def normalize(item: dict) -> dict:
    if not isinstance(item, dict):
        raise SyncError('Galerie obsahuje neočekávaný záznam.')
    row = {
        'id': item.get('id'),
        'datetime': item.get('datetime_created', item.get('datetime')),
        'station': item.get('station'),
        'category': item.get('station_category', item.get('category')),
        'team': item.get('team'),
        'value': item.get('value'),
        'author': item.get('author') or '',
    }
    if isinstance(row['id'], bool) or not isinstance(row['id'], int) or row['id'] < 1:
        raise SyncError('Neplatné ID události.')
    if isinstance(row['value'], bool) or not isinstance(row['value'], int) or row['value'] < 3:
        raise SyncError(f'Neplatná hodnota události #{row["id"]}.')
    if not all(isinstance(row[f], str) and row[f].strip() for f in ('datetime', 'station', 'category', 'team')):
        raise SyncError(f'Neúplná událost #{row["id"]}.')
    return row


def download(session: requests.Session, api_url: str) -> list[dict]:
    result: dict[int, dict] = {}
    offset = 0
    for _ in range(MAX_PAGES):
        response = session.get(api_url, params={'offset': offset, 'limit': PAGE_LIMIT},
                               headers={'Accept': 'application/json'}, timeout=40)
        response.raise_for_status()
        try:
            data = response.json()
        except ValueError as exc:
            raise SyncError('Galerie nevrátila JSON (možná vypršelo přihlášení).') from exc
        if not isinstance(data, dict) or not isinstance(data.get('captures'), list):
            raise SyncError('Neznámá struktura JSON galerie, aktualizace se neprovede.')
        batch = data['captures']
        for raw in batch:
            item = normalize(raw)
            existing = result.get(item['id'])
            if existing and existing != item:
                raise SyncError(f'Konfliktní ID #{item["id"]} v galerii.')
            result[item['id']] = item
        more = data.get('has_more')
        if more is False or not batch:
            break
        if more is None and len(batch) < PAGE_LIMIT:
            break
        next_offset = data.get('next_offset', offset + len(batch))
        if not isinstance(next_offset, int) or next_offset <= offset:
            raise SyncError('Galerie neposkytla korektní stránkování.')
        offset = next_offset
    else:
        raise SyncError('Překročen bezpečnostní limit počtu stránek galerie.')
    if not result:
        raise SyncError('Galerie nevrátila žádné události; historie zůstává beze změny.')
    return sorted(result.values(), key=lambda r: r['id'])


def validate_new(items: list[dict], topology: dict, teams: set[str]) -> None:
    valid_stops = {(s['category'], s['name']) for s in topology['stations']}
    now = datetime.now(timezone.utc) + timedelta(hours=1)
    for row in items:
        if (row['category'], row['station']) not in valid_stops:
            raise SyncError(f'Neznámá zastávka nebo kategorie v #{row["id"]}.')
        if row['team'] not in teams:
            raise SyncError(f'Neznámý tým v #{row["id"]}.')
        match = re.fullmatch(r'(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})', row['datetime'])
        if not match:
            raise SyncError(f'Neplatný formát času u #{row["id"]}.')
        day, month, year, hour, minute, sec = map(int, match.groups())
        try:
            dt = datetime(year, month, day, hour, minute, sec, tzinfo=ZoneInfo('Europe/Prague'))
        except ValueError as exc:
            raise SyncError(f'Neplatné datum u #{row["id"]}.') from exc
        if not START <= dt <= min(END, now):
            raise SyncError(f'Událost #{row["id"]} je mimo povolené období.')


def merge(existing: list[dict], fetched: list[dict], topology: dict, teams: set[str]) -> tuple[list[dict], int]:
    old = {row['id']: row for row in existing}
    if len(old) != len(existing):
        raise SyncError('Duplicitní ID ve stávající historii.')
    incoming = {row['id']: row for row in fetched}
    overlap = set(old) & set(incoming)
    if not overlap or max(old) not in overlap:
        raise SyncError('Galerie neobsahuje poslední uložené ID; nelze bezpečně ověřit návaznost.')
    for event_id in overlap:
        if old[event_id] != incoming[event_id]:
            raise SyncError(f'Galerie změnila historickou událost #{event_id}; automatický přepis je zakázán.')
    added = [row for row in fetched if row['id'] not in old]
    if added and min(row['id'] for row in added) < max(old):
        raise SyncError('V exportu se zpětně objevilo chybějící historické ID; vyžaduje ruční audit.')
    validate_new(added, topology, teams)
    all_rows = sorted([*existing, *added], key=lambda r: r['id'])
    return all_rows, len(added)


def main() -> int:
    # The game is intentionally short-lived; the workflow will not contact the game after its end.
    if datetime.now(ZoneInfo('Europe/Prague')) >= END:
        print('Hra skončila 5. 12. 2026 ve 03:00; synchronizace vypnutá.')
        return 0
    email = os.getenv('LA_LINIA_EMAIL', '').strip()
    password = os.getenv('LA_LINIA_PASSWORD', '')
    if not email or not password:
        print('Chybí GitHub Secrets LA_LINIA_EMAIL / LA_LINIA_PASSWORD. Přihlašování se přeskočí.')
        return 0
    existing = json.loads(OUTPUT.read_text(encoding='utf-8'))
    topology = json.loads(TOPOLOGY.read_text(encoding='utf-8'))
    checkpoint = json.loads((OUTPUT.parent / 'checkpoint.json').read_text(encoding='utf-8'))
    teams = {t['name'] for t in checkpoint['teams']}
    session = requests.Session()
    session.headers['User-Agent'] = 'Mozilla/5.0 (compatible; LaLiniaSync/1.0; GitHubActions)'
    login(session, email, password)
    response = session.get(GALLERY, timeout=30)
    response.raise_for_status()
    if '/auth/login' in response.url or not response.url.startswith(BASE + '/la_linia/'):
        raise SyncError('Přihlášení nebylo přijato / galerie přesměrovala mimo hru.')
    api_url = discover_gallery_api(response.text, response.url)
    fetched = download(session, api_url)
    result, count = merge(existing, fetched, topology, teams)
    if count:
        OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Write only after successful login, download, merge, and validation.
    # This also records successful checks where there were zero new captures.
    sync_status = {'last_success_utc': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
                   'latest_event_id': result[-1]['id'], 'new_events': count}
    (OUTPUT.parent / 'sync-status.json').write_text(
        json.dumps(sync_status, ensure_ascii=False, indent=2) + '\\n', encoding='utf-8')
    print(f'Synchronizace OK: v galerii {len(fetched)}, nové {count}, celkem {len(result)}, poslední ID #{result[-1]["id"]}.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (SyncError, requests.RequestException, OSError, ValueError) as exc:
        # Exception text from HTTP clients may include URLs; never print request payloads or secrets.
        print(f'Chyba synchronizace: {type(exc).__name__}: {exc}', file=sys.stderr)
        sys.exit(1)
