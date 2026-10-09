## 2026-10-09 — Ověření CI a bezpečnostní hranice Product Subtype
- CI pro PR #397 úspěšně dokončilo unit testy/typecheck/production build, databázové testy nad lokálním PostgreSQL, Playwright smoke testy a Cloudflare Worker build bez deploye; bezpečnostní audit závislostí a CodeQL také prošly.
- Ingest DRY RUN [37914167628](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37914167628) na commitu `fae9f2f` úspěšně zpracoval 24 vstupů, 24 deduplikovaných kandidátů a 0 chyb. Všech 24 mělo stav `would_insert_or_merge`; nebyl proveden databázový zápis.
- Regresní testy priorit zůstávají specifikací politiky založenou na syntetických signálech, nikoli produkčním klasifikátorem. Přidán test skutečné funkce `buildProductSubtypeMappings`, který ověřuje, že nový návrh „Světlé pivo“ zůstává mimo produkční registr a nevytvoří přiřazení.
- Samostatný resolver priorit pro textové důkazy u 24 rozšiřujících návrhů zatím v produkční logice neexistuje; před automatickým přiřazováním je nutné jej navrhnout jako sdílenou, testovatelnou logiku a vyhodnotit proti reálnému katalogu v read-only režimu.
- Žádné schválení návrhů, databázové zápisy ani přiřazování produktů.

## 2026-10-09 — Zpřesnění hranic kandidátů Product Subtype
- Upraveno všech 24 návrhů v `docs/examples/product-subtype-registry-expansion-candidates.json`: explicitní důkaz, vzájemné výluky a zacházení s nejednoznačnými produkty.
- Doplněna rozhodovací priorita pro těstoviny, rýži a tavený sýr; u tvarohu se zakazuje odvozovat tučnost bez ověřené specifikace; u piva a tuňáka rozhoduje výslovné označení.
- Doplněn revizní dokument a obecná pravidla hranic/preference do `docs/12_PRODUCT_TYPES.md`.
- Původní ingest DRY RUN [37912495113](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37912495113) proběhl před poslední úpravou; následný DRY RUN [37913251670](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37913251670) na commitu PR #396 potvrdil 24 vstupů, 24 deduplikovaných kandidátů a 0 chyb.
- PR #396 byl sloučen; návrhy zůstávají věcně neschválené a nebyly zapsány do databáze. Neprovádět `--apply` bez samostatného rozhodnutí.

## 2026-10-09 — Automatické testy priorit a překryvů Product Subtype
- Přidán `lib/product-subtype-candidate-precedence.test.ts` s regresními testy priorit těstovin a rýže, konfliktních signálů, explicitních důkazů a hranic piva, tvarohu, tavených sýrů a tuňáka.
- Testy ověřují přítomnost a jedinečnost 24 návrhů v kandidátním JSON. Syntetické testy dokumentují zamýšlenou politiku; samy o sobě netestují produkční klasifikaci těchto návrhů.
- PR #397 byl sloučen. CI run [37913741324](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37913741324) prošel; bezpečnostní audit [37913741220](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37913741220) také prošel.
- Bez databázových zápisů, schvalování poddruhů nebo přiřazování produktů.
