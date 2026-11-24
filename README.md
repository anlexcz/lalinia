# La Linia – univerzální herní přehled

Statická mobilní aplikace pro GitHub Pages určená všem pěti týmům. Má společný Přehled, Mapu, týmově volitelné Operace (útok/obrana) a úplnou historii Událostí. Žebříček jde seřadit podle skóre celkem nebo bez území.

## Data

- `data/topology.json`: 398 stanovišť (z toho 292 tramvajových), 328 herních spojnic. **Neměnit při aktualizaci obsazení.**
- `data/rules.json`: tabulky územních bonusů a decay, minimum hráčů, konečné.
- `data/checkpoint.json`: výchozí snapshot vlastníků a skóre, navázaný na historii do události ID 331. Není potřeba jej aktualizovat při nových obsazeních.
- **`data/captures.json`: jediný soubor pro běžnou ruční aktualizaci.** Aktuálně nejméně 412 doložených záznamů (poslední ručně vložená událost ID 417); automatická synchronizace může historii rozšířit. Při novém úplném exportu lze celý soubor bezpečně nahradit; u průběžných ručních dodatků přidávejte události podle originálního ID.

### Jak ručně přidat obsazení

Na konec pole v `data/captures.json` vložte nový objekt s novým jednoznačným ID:

```json
{
  "id": 418,
  "datetime": "23. 11. 2026, 18:42:00",
  "station": "Prašný most",
  "category": "tram",
  "team": "Cosa Nostra",
  "value": 4,
  "author": "Jméno"
}
```

Uvedený objekt je **jen ukázka formátu, ne skutečné obsazení**. Dodržte český čas `Europe/Prague`, jména týmů a názvy zastávek přesně podle vstupních souborů. Přidávat lze více záznamů najednou; web je chronologicky seřadí. Nová událost musí mít unikátní originální ID (po posledním ručním importu zpravidla `> 417`). Záznamy do ID 331 ukotvuje výchozí checkpoint. Novější události z něj aplikace přehrává. Při chybné události ji opravte nebo smažte před publikací.

Úložiště GitHub Pages se po commitu automaticky aktualizuje, pokud je v nastavení repozitáře povolen deploy z větve `main` (kořen `/`). Web načítá data bez cache při otevření a každou minutu přepočítává decay. Web načítá aktualizovanou historii přímo z veřejného raw souboru větve `main` a kontroluje ji každé dvě minuty; data z GitHub Pages jsou záložní variantou. Kvůli cache GitHubu může být zobrazení o několik minut opožděné.

## Přehled bodů a jízdenek

- Přepínání **Celkem / Bez území** přepočítává pořadí všech týmů. „Bez území“ obsahuje tramvajové, vlakové a případné metro body.
- **Jízdenky** se počítají z obsazení mezi 03:00 a následující 02:59:59 v Europe/Prague: tramvajové obsazení stojí počet zabírajících hráčů, vlakové a metro eventy nula. Každý tým má 120 jízdenek na den, reset je ve 03:00. Výpočet vychází z posledního nahraného exportu, nejde o živé saldo serveru.
- Vlakové obsazení se započítává do samostatných vlakových bodů a nečerpá jízdenky ani nevytváří území. Podle porovnání s oficiálním skóre se u první vlakové akce nepřičítá tramvajový bonus +2; regresní test chrání referenční skóre po ID 417.
- **Vlakové eventy (bez decay):** stanice se zpřístupní v 03:00 a lze ji poprvé obsadit alespoň 3 hráči. Při každém dalším obsazení je nutný alespoň o jednoho hráče větší tým, než při předchozím obsazení (bez časového poklesu hodnoty). Ve 03:00 následujícího dne se vlastník uzamkne natrvalo a poslední počet hráčů zůstane zobrazen jako hodnota. Vlaky nemají tramvajový +2 bonus, násobič konečné, územní bonus ani spotřebu jízdenek. Ve vlakových Událostech se nikdy nezobrazuje decay. Referenční skóre po #417 zůstává zachováno.

## Události a skóre

- **Události**: filtry podle týmu, vlastních zisků, vlastních ztrát, vlastních posílení a všech převzetí. Historie se počítá chronologicky z `captures.json` podle stabilní zastávky, ne z Discord časů.
- **Území**: přepínač u vlastního skóre přičítá/odečítá územní bonus jen ve zobrazeném součtu; oficiální pořadí ani výpočetní engine nemění.
- Záznamy exportu mají přesnost na sekundy; v číselné řadě ID 2–409 scházejí ID 248, 292, 375, 389. Aplikace chybějící ID nedoplňuje.

## Výpočty a omezení

- Nové události se aplikují na výchozí checkpoint; změny přímého skóre a území se přepočítají po každé nové akci.
- **Výchozí čas snapshotu není doložen.** Aktuální součty jsou nadále ukotveny v oficiálním checkpointu. Kompletní historie 328 skutečně doložených událostí do ID 331 je ovšem rekonstruovatelná od počátečního prázdného stavu: součet všech historických přímých, vlakových a územních změn **přesně odpovídá všech pěti týmům v checkpointu**. Tyto jednotlivé bodové změny lze proto zobrazit i u starších událostí.
- Hodnoty z obsazení se snižují po sekvenčně sčítaných intervalech v `decay_hours`. Přesná implementace serveru není nezávisle ověřena.
- U vlakových a metro eventů nemusí rekonstrukce bodování vystihovat speciální pravidla. Historie eventů je zachována, ale přírůstkové skóre těchto kategorií vyžaduje kontrolu.
- Sekce Útok hodnotí **každé převzetí samostatně**. Sekce Operace propočítává celé dvojice a trojice po společné změně vlastníků a novém rozdělení všech komponent; nepřičítá jednotlivé bodové zisky. Hledání je heuristické a geograficky omezené, nikoli úplný důkaz optima.
- Předpověď dostupnosti je podmíněna tím, že zastávka nebude mezitím znovu obsazena.
- Minimální počet na převzetí je `max(3, aktuální hodnota + 1)`; pro neutrální zastávky 3.
- Limit velikosti skupiny závislý na počtu členů týmů není automaticky ověřen.
- Mapa zobrazuje herní síť na souřadnicovém náčrtu, **nikoli skutečné dopravní trasy**.

## Lokální spuštění

```bash
python -m http.server 8000
```

Otevřete `http://localhost:8000`. Aplikace nevyžaduje balíčky ani sestavení.

## Funkce verze 2

- **Detail zastávky**: kompletní historie zaznamenaných obsazení podle ID a času; první obsazení, převzetí a posílení. Samostatně je zobrazen skutečný event log a předpovězené decay.
- **Operace**: hledání lokálních dvojic a trojic, reálný přepočet skóre všech týmů a maximálního požadovaného počtu hráčů. Drahé operace a nedostupné skupiny se vynechají. Čas jízdy není započítán.
- **Přehled**: poslední obsazení; kliknutí otevře kompletní historii příslušné zastávky.
- **Obrana**: očekávaná bodová ztráta včetně zničeného územního bonusu.
- **Decay**: budoucí čas, kdy bude stačit zvolený počet hráčů.

Jediným průběžně aktualizovaným souborem zůstává `data/captures.json`. Automatika zapisuje pouze nové originální události.

## Publikace

Nahrajte všechny soubory archivu do kořene repozitáře `anlexcz/lalinia`, nikoliv celý archiv jako jeden soubor. V GitHub Pages nastavte `Deploy from a branch` → `main` → `/ (root)`.

Kontrolní testy: `node tests/check.mjs`.


## Synchronizace galerie každých 10 minut

Workflow: [Synchronizace galerie La Linia](.github/workflows/sync-captures.yml). Spouští se pomocí `cron: '7-59/10 * * * *'` (minuty **07, 17, 27, 37, 47, 57**) nebo ručně v GitHub Actions; interval je požadovaný, ale start běhů **GitHub negarantuje na minutu přesně**.

### Jednorázové nastavení na mobilu

1. Otevřete repozitář `anlexcz/lalinia` na GitHubu, případně přepněte prohlížeč do desktopového zobrazení.
2. Jděte na **Settings → Secrets and variables → Actions → New repository secret**.
3. Vytvořte dva Secrets: `LA_LINIA_EMAIL` a `LA_LINIA_PASSWORD` s údaji herního účtu, který má právo číst galerii. Přístupové údaje nikam necommitujte a neposílejte do chatu.
4. V **Settings → Actions → General → Workflow permissions** vyberte **Read and write permissions** pro `GITHUB_TOKEN` (pokud je tato volba dostupná).
5. V **Actions → Synchronizace galerie La Linia → Run workflow** spusťte zkušební běh a podívejte se do logu.

Bez Secrets běh **nepřistupuje k galerii a nic nezapisuje**. Přihlášení přes běžný e-mailový formulář a čtení atributu `data-captures-url` se bez skutečného účtu nedalo ověřit, takže první běh může odhalit nutnost úpravy adaptéru. Přihlášení Google OAuth zatím podporováno není.

Synchronizační skript: `scripts/sync_captures.py`. Kontroluje originální ID, shodnost již uložených událostí, návaznost historie, existenci zastávek a týmů, unikátnost ID i stránkování. Při konfliktu nebo chybě nesmí přepsat původní data. Přidání nových ID vytvoří jeden commit, bez novinek se commit nevytvoří. Souběžné běhy jsou serializované pomocí GitHub Actions `concurrency`.

**Důležité pro GitHub Pages:** commit vytvořený přes `GITHUB_TOKEN` automaticky nespustí Pages build. Proto web místo čekání na nové Pages nasazení načítá `captures.json` přímo ze zveřejněné větve `main` přes raw.githubusercontent.com, s lokální zálohou a dvouminutovým kontrolním intervalem.

Skript po **5. 12. 2026 03:00 Europe/Prague** přestane galerii kontaktovat. Pak lze workflow vypnout v GitHub Actions. Automatizovaný přístup by měl být v souladu s pravidly a souhlasem provozovatele Podsvětí.

Test lokálně: `python -m unittest discover -s tests -p 'test_sync.py'` a `node tests/check.mjs`.


## Univerzální rozhraní – listopad 2026

- **Přehled** je pro všechny týmy stejný. V jediném kompaktním žebříčku je tým, body a zbývající denní jízdenky. Přepínač `Celkem / Bez území` přerovnává pořadí. Po rozkliknutí řádku se zobrazí rozpad na tramvajové body v riziku, body Decay, vlak, metro a aktuální území, s procentuálním pruhem. Uchované tramvajové body jsou **tramvajové skóre mínus současná odečitatelná hodnota vlastněných zastávek**; zahrnují tak i první bonusy a historické zisky, nejde o čisté „body za decay“.
- Pod žebříčkem je seznam **skutečných událostí za klouzavých 60 minut**, včetně změny přímých i celkových bodů obou týmů. Při převzetí s prokazatelným decay se zobrazuje, kolik přímých bodů původnímu týmu zůstalo. Bodové změny se nyní **rekonstruují i pro všech 328 událostí do checkpointu ID 331**; jejich součet se ověřuje oproti bodům všech pěti týmů v checkpointu. Novější události se nadále přehrávají z checkpointu.
- **Události**: posledních 30 položek, tlačítko přidává dalších 30, filtry dle týmu (včetně jeho ztrát), typu a hledaného názvu zastávky.
- **Mapa**: nezávislé přepínače tramvají, vlaků a spojnic; tramvajové značky jsou kolečka, vlakové čtverce; obojí obsahuje aktuální herní hodnotu.
- **Operace**: přepnutí Útok/Obrana, počet hráčů, volitelný cílový či útočící tým. Samostatné útoky rozlišují přímý bodový zisk/ztrátu od celkového dopadu včetně územních komponent.
- Výběr týmu v horní části si web pamatuje lokálně a ovlivňuje **Operace** a detaily zastávek, ne společný Přehled.
- Synchronizace zůstává každých 10 minut přes GitHub Actions; web kontroluje nové události každé dvě minuty. Úpravy UI nepřidávají server.

Regresní testy: `node tests/check.mjs` a `node tests/universal.test.mjs`.
