# 42 — Teta drogerie: technický audit zdroje a návrh importeru

Stav: **návrh, nic není nasazeno ani zapojeno do produkce.** Přístup k `tetadrogerie.cz` (DNS) v tomto prostředí nefungoval, proto nebyla ověřena žádná odpověď e-shopu.

## Doložené (zadání)
Veřejný katalog `https://www.tetadrogerie.cz/eshop/produkty` a `.../produkty/vse` zobrazuje přes 10 000 online produktů: názvy, ceny, jednotkové ceny, značky, některé akční a klubové nabídky. **Neověřeno:** EAN, ceny kamenných prodejen, robots.txt/podmínky, existence API či sitemapy, stránkování, struktura HTML/JSON.

## Audit existující architektury
- Konektory `lib/ingestion/*` (`PriceConnector`: fetch → normalize → `ingest.ts`). Vzor: `dm.ts` (drogerie, normalizace jednotek, `promotionWithoutValidity`).
- `product_source` enum (`lib/db/schema.ts`) nemá hodnotu `teta`; `product_external_refs` je unikátní na `(source, external_id)` → idempotence.
- Cenová data: `NormalizedProduct` (regulární cena + volitelná akce s platností), historie cen se nepřepisuje (`ingest.ts`).
- Kategorie: `ItemCategory`; taxonomie/deduplikace (`docs/12_PRODUCT_TYPES.md`, `docs/34_CATALOG_IDENTITY.md`) pracuje nad již uloženými produkty. Bez EAN se Teta produkt spáruje jen přes `(source, externalId)`, případně názvem/značkou — nesmí se slučovat jen podle názvu.

## Co je připraveno
- `lib/ingestion/teta.ts`: vlastní snapshotový kontrakt `TetaRawProduct` (není to tvar odpovědi Tety), `normalizeTetaProduct` (validace, Kč/kg|l|ks, kontrola jednotkové ceny vs. balení, akce jen s uvedeným koncem platnosti, klubová cena se ignoruje), `dryRunTeta` (report bez DB/sítě, hlásí duplicity), `parseTetaFixture`.
- Fixture: `lib/ingestion/fixtures/teta-catalog.sample.json` — **syntetická** data (`TEST-*`), žádné skutečné produkty.
- Testy: `lib/ingestion/teta.test.ts` (bez přístupu na web).
- Dry-run: `pnpm teta:dry-run [soubor.json]`.
- Záměrně chybí: fetcher, registrace konektoru, migrace, cron, ostrý import.

## Nutné ověřit nad skutečnými odpověďmi Tety
1. robots.txt a podmínky použití; zda je automatizované čtení dovoleno (případně oficiální feed).
2. Technický zdroj dat (HTML, vnitřní JSON, sitemapa), stránkování, stabilní ID/SKU produktu.
3. Zda existuje EAN; formát jednotkové ceny a balení; kategorie (mapování `TOP_LEVEL_CATEGORY` je odhad, nutno doplnit podle skutečného stromu).
4. Podoba akcí: zda je uvedena platnost; význam klubové ceny; měna.
5. Ceny online vs. kamenné prodejny (ukládat jako online/řetězcové, ne jako cenu pobočky).
6. Po ověření: migrace (`product_source` += `teta`, řádek `stores.chain='Teta'`), fetcher mapující do `TetaRawProduct`, `PriceConnector`, a teprve pak plánování.
