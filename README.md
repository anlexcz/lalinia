# La Linia – strategický přehled Cosa Nostra

Statická mobilní webová aplikace pro GitHub Pages. Obsahuje herní síť, přesné tabulky územních bonusů, rekonstrukci obsazení, decay, útoky, kombinované operace, obranu, historii zastávek a stránku Události s filtry. Územní body v přehledu lze zapnout nebo vypnout pouze pro zobrazení.

## Data

- `data/topology.json`: 398 stanovišť (z toho 292 tramvajových), 328 herních spojnic. **Neměnit při aktualizaci obsazení.**
- `data/rules.json`: tabulky územních bonusů a decay, minimum hráčů, konečné.
- `data/checkpoint.json`: výchozí snapshot vlastníků a skóre, navázaný na historii do události ID 331. Není potřeba jej aktualizovat při nových obsazeních.
- **`data/captures.json`: jediný soubor pro běžnou ruční aktualizaci.** Aktuálně 404 ověřených záznamů z oficiálního exportu (ID 2–409, 21.–23. 11. 2026 do 20:37:37). Při novém úplném exportu lze celý soubor bezpečně nahradit; u průběžných ručních dodatků přidávejte události podle originálního ID.

### Jak ručně přidat obsazení

Na konec pole v `data/captures.json` vložte nový objekt s novým jednoznačným ID:

```json
{
  "id": 410,
  "datetime": "23. 11. 2026, 18:42:00",
  "station": "Prašný most",
  "category": "tram",
  "team": "Cosa Nostra",
  "value": 4,
  "author": "Jméno"
}
```

Uvedený objekt je **jen ukázka formátu, ne skutečné obsazení**. Dodržte český čas `Europe/Prague`, jména týmů a názvy zastávek přesně podle vstupních souborů. Přidávat lze více záznamů najednou; web je chronologicky seřadí. Nová událost musí mít unikátní originální ID (po tomto exportu zpravidla `> 409`). Záznamy do ID 331 ukotvuje výchozí checkpoint. Novější události z něj aplikace přehrává. Při chybné události ji opravte nebo smažte před publikací.

Úložiště GitHub Pages se po commitu automaticky aktualizuje, pokud je v nastavení repozitáře povolen deploy z větve `main` (kořen `/`). Web načítá data bez cache při otevření a každou minutu přepočítává decay. **Přidání události vyžaduje obnovení stránky.**

## Přehled bodů a jízdenek

- Přepínání **Celkem / Bez území** přepočítává pořadí všech týmů. „Bez území“ obsahuje tramvajové, vlakové a případné metro body.
- **Jízdenky** se počítají z obsazení mezi 03:00 a následující 02:59:59 v Europe/Prague: tramvajové obsazení stojí počet zabírajících hráčů, vlakové a metro eventy nula. Každý tým má 120 jízdenek na den, reset je ve 03:00. Výpočet vychází z posledního nahraného exportu, nejde o živé saldo serveru.
- Vlakové obsazení se započítává do skóre jako tramvajové (bez územního bonusu) a přitom nečerpá jízdenky.

## Události a skóre

- **Události**: filtry podle týmu, vlastních zisků, vlastních ztrát, vlastních posílení a všech převzetí. Historie se počítá chronologicky z `captures.json` podle stabilní zastávky, ne z Discord časů.
- **Území**: přepínač u vlastního skóre přičítá/odečítá územní bonus jen ve zobrazeném součtu; oficiální pořadí ani výpočetní engine nemění.
- Záznamy exportu mají přesnost na sekundy; v číselné řadě ID 2–409 scházejí ID 248, 292, 375, 389. Aplikace chybějící ID nedoplňuje.

## Výpočty a omezení

- Nové události se aplikují na výchozí checkpoint; změny přímého skóre a území se přepočítají po každé nové akci.
- **Výchozí čas snapshotu není doložen.** Původní výsledky jsou ukotveny v dodaném checkpointu a předpokládá se, že přiložená historie do ID 331 odpovídá témuž stavu.
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

Neaktivujte automatické zapisování capture z webu; jediným rutinně upravovaným souborem zůstává `data/captures.json`.

## Publikace

Nahrajte všechny soubory archivu do kořene repozitáře `anlexcz/lalinia`, nikoliv celý archiv jako jeden soubor. V GitHub Pages nastavte `Deploy from a branch` → `main` → `/ (root)`.

Kontrolní testy: `node tests/check.mjs`.
