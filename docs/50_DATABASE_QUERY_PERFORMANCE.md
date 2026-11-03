# Neon query performance audit

**Datum:** 2026-11-03
**Prostředí:** produkční Neon projekt používaný `.env.local`, read-only diagnostika přes `neon inspect db`
**Bezpečnost:** connection string ani osobní údaje nebyly vypsány.

## Metoda

- `neon inspect db outliers`, `calls`, `table-sizes`, `index-sizes`, `seq-scans`, `vacuum-stats`, `long-running-queries` a `unused-indexes`.
- `PERF_TIMING=1` nad `getHouseholdData` s reprezentativní domácností a přímým PostgreSQL připojením, tedy bez vlivu Neon HTTP klienta.
- Serializovaná velikost dat, která se posílají do klientského `AppShell`.

`lfc-hit-rate` a `working-set` nešly změřit, protože v databázi není nainstalované rozšíření `neon`. Audit jej záměrně nevytvářel.

## Nálezy

- Databáze nemá dlouho běžící dotazy ani zjevný blokující lock.
- Největší tabulky jsou `pkd_product_type_candidates` (25 MB), `pkd_entries` (16 MB), `products` (12 MB), `pkd_external_mappings` (11 MB) a `prices` (11 MB).
- Pro produktové a cenové dotazy existují cílené indexy včetně `products_search_name_trgm_idx`, indexů nad `prices(product_id, … observed_at)` a `deals(valid_from, valid_until, product_id)`. Audit proto nepřidával další indexy.
- `unused-indexes` je pouze orientační: statistiky `pg_stat_user_indexes` byly v krátkém okně a nulový počet skenů sám o sobě neopravňuje index odstranit.
- Jeden personalizovaný dotaz nad akcemi měl v `pg_stat_statements` 297 ms a dotaz pro doplnění zásob 263 ms. Oba jsou stránkované nebo podmíněné; nebyly příčinou běžného načtení Domů.
- `getHouseholdData` měl před úpravou první běh 486 ms, další 248 ms a 207 ms. Po spojení dotazů na člena a domácnost byl první běh 428 ms, teplé běhy 214 ms a 196 ms. Zbývající čas tvoří hlavně paralelní načtení dat pro jednotlivé části domácnosti a druhý dotaz pro položky hlavního seznamu.

## Hlavní příčina pomalého načtení

Samotná relační data domácnosti nebyla velká. Problém byl v tom, že se při každém načtení stránky serializoval celý globální adresář a všechny aktuální samostatné akce:

| Data | Počet | Přibližná serializovaná velikost |
|---|---:|---:|
| Prodejny | 1 839 | 637 KB |
| Samostatné akce | 492 | 108 KB |
| Domácnost | viz níže | 86 KB |
| Ceny produktů ze seznamu | 1 produkt | 1 KB |

Domácnost měla 63 položek zásob, 77 výdajů a 8 nákupů. Její serializovaná data měla 86 KB; největší část tvořily `pantryItems` (34 KB), `purchaseHistory` (27 KB) a `expenses` (21 KB).

Původní přibližný payload byl **835 KB** před kompresí a bez režie RSC. Po úpravě je pro stejnou domácnost **90 KB**.

## Provedená optimalizace

- Adresář 1 839 prodejen se už neposílá při načtení stránky. `storeLocationsAction` jej načte až při otevření profilového výběru obchodů nebo ručního zadání účtenky.
- Samostatné akce se načítají pouze pro názvy položek aktuálního seznamu. Při změně seznamu je krátký výsledek obnoven serverovou akcí; do klientského stavu se nedostane celý katalog akcí.
- Dotaz na člena domácnosti už v jednom relačním dotazu načte i domácnost, čímž zmizel samostatný round-trip.
- Běžné domácnosti dál dostávají data, která potřebují pro Domů, navigaci, upozornění, nákupní seznam, zásoby, rozpočet a recepty. Případné další rozdělení podle otevřené záložky by vyžadovalo samostatný lazy-state návrh; bez něj by hrozilo, že se změní chování při přepínání sekcí.

## Ověření

- Kořenový TypeScript prošel s `NODE_OPTIONS=--max-old-space-size=4096`.
- Cílené testy pro mobilní dashboard, cache invalidaci, nabídky a novou serverovou akci prošly.
- Produkční Next.js build prošel včetně kompilace nových server actions.
- Měření potvrdilo 0 samostatných nabídek pro reprezentativní seznam s jedním produktem, který žádnou takovou nabídku nemá.

## Další bezpečný krok

Zapnout `PERF_TIMING=1` v produkčním Workeru nebo dočasně na preview a po nasazení porovnat `[perf]` a `[rum]` záznamy pro skutečné uživatele. Tím se oddělí zbytek latence sítě, cold startu a klientského vykreslení od databázové práce.
