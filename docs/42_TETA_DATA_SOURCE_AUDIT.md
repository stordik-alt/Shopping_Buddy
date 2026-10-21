# 42 — Teta drogerie: technický audit zdroje a návrh importeru

Stav: **zdroj je ověřen živě (2026-10-21/22), sběr i import jsou implementované; ostrý import do produkce ještě probíhá.** Původní stav (2026-10-19) byl „návrh, nic není nasazeno" — ten je zachovaný níže jako historie auditu, aktuální stav je na konci dokumentu.

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


## Rozšíření snapshotového modelu (2026-10-19)

Přidán `lib/ingestion/teta-source-model.ts` jako interní kontrakt ANITKY pro dvě úrovně zdroje:

- `TetaCatalogCardSnapshot`: identita, URL, název, značka, kategorie, balení, zobrazená/reference/jednotková cena a online dostupnost.
- `TetaProductDetailSnapshot`: EAN, doplňující balení a atributy, stav ukončení prodeje a případné oznámení o stažení.
- `TetaPriceOfferSnapshot`: oddělené běžné, akční, klubové a množstevní nabídky včetně podmínek a platnosti.
- `TetaAvailabilitySnapshot`: samostatná pozorování online dostupnosti nebo dostupnosti konkrétní prodejny.

`validateTetaSnapshotIdentity` kontroluje konzistenci identity katalogu/detailu, základní formát EAN, identifikaci pobočky, čas pozorování a minimální podmínky množstevní nabídky. `toTetaRawProduct` převádí snapshot do již existujícího vstupního kontraktu importeru; klubové a množstevní nabídky se nepřevádějí na běžnou cenu. Jednoduchá akce se připojí pouze při shodě s aktuálně zobrazenou cenou a explicitním koncem platnosti.

Dále byla zpřísněna normalizace: explicitně uvedená jednotková cena s nepodporovanou jednotkou se odmítne místo tichého odhadu `1 ks`. Chybějící jednotková cena může dál použít dosavadní fallback podle pravidel importeru.

**Omezení:** jde o interní kontrakty ANITKY, nikoli o potvrzené schéma HTML/API Tety. Neexistuje fetcher, nebyla provedena síťová validace, databázový zápis ani produkční import. Reálná struktura kategorií, pokrytí EAN, pravidla cen a dostupnost poboček zůstávají neověřené.


## Veřejný HTML collector — první pilot (2026-10-19)

Přidáno:

- `lib/ingestion/teta-public-html.ts`: parser veřejných katalogových odkazů a detailních HTML stránek, konzervativní extrakce názvu, interního kódu, případného EAN/GTIN, značky/kategorie z JSON-LD, kandidátů cen, jednotkové ceny a online dostupnosti.
- `scripts/teta-fetch-public-catalog.ts` a příkaz `pnpm teta:fetch-public`: načte veřejné HTML stránky katalogu, deduplikuje odkazy na `/eshop/katalog/`, následně čte omezený vzorek detailů a uloží výzkumný JSON do `data/external/teta-public-catalog-sample.json`.
- `lib/ingestion/teta-public-html.test.ts`: testy parseru odkazů, dekódování HTML, detailních polí a fallbacku JSON-LD.
- Collector povoluje pouze HTTPS host `www.tetadrogerie.cz`, před načtením každé stránky načte a vyhodnotí aktuální `robots.txt` (při chybě ověření se zastaví), navíc explicitně blokuje `/api/`, `/price` a `/inventory`, používá identifikující User-Agent a sériové požadavky s prodlevou nejméně 1 s. Mapování kategorií v `teta.ts` bylo rozšířeno o aktuální názvy viditelné na katalogu (např. Pleť, Vlasy, Tělo, Potraviny, Mazlíčci). Výchozí běh je 1 katalogová stránka a 20 detailů; jeden běh je omezen nejvýše na 10 katalogových stránek a 100 detailů.

Příklad:
```bash
pnpm teta:fetch-public
pnpm teta:fetch-public --pages=2 --products=40 --out=data/external/teta-pilot.json
```

Výstup je **výzkumný dataset**, ne importní feed. Ceny jsou záměrně vedeny jako kandidáti bez automatického rozlišení běžné/akční/klubové ceny; pokud stránka uvádí více cen, parser přidá varování. Sběr nevolá interní API, nezapisuje do databáze, neregistruje konektor a nezavádí cron. První pilot musí být spuštěn lokálně, zkontrolován na skutečných HTML odpovědích a teprve potom lze zpřesnit parser nebo připravit import.

## Ověření nad skutečnými odpověďmi Tety (2026-10-21/22)

Otázky z části „Nutné ověřit" mají odpověď — vše bylo ověřeno živě na `www.tetadrogerie.cz`:

| Otázka | Odpověď |
|---|---|
| robots.txt a podmínky | `robots.txt` existuje a blokuje `/api/`, `/price`, `/inventory`, `/taxon`, `/searchtext`, `/nakupni-kosik/*`, `/muj-ucet/*`, `/logout`, `/order/*`, `/_nuxt/`. `Crawl-delay` není stanoven; aplikace si sama drží **≥ 1 s** mezi požadavky. Čtou se jen veřejné HTML stránky, nikdy interní API. |
| Technický zdroj dat | Nuxt aplikace; data jsou v `<script id="__NUXT_DATA__">` ve formátu **devalue-flatten**. Viz `lib/ingestion/teta-payload.ts`. |
| Stránkování | `/eshop/produkty/vse` vrací `pagination {currentPage, lastPage:250, itemsPerPage:40, totalItems:10000}` — **to je limit platformy**, ne skutečná velikost katalogu. Po 14 hlavních kategoriích je katalog **13 360 produktů** (341 stránek). Sitemap (`/__sitemap__/cs-CZ.xml`) uvádí 37 519 URL, většina mimo e-shop. |
| Stabilní ID | 15místný číselný kód produktu (`code`), slug a `variantId`. Kód je použitý jako `externalId`. |
| EAN | **Teta EAN nepublikuje** — hledáno v HTML i v payloadu (`ean`, `barcode`, `gtin`), shoda je pouze uvnitř názvů obrázků. EAN se proto doplní z DM (`gtin` z tile API). |
| Balení a jednotková cena | `bbyPrices.unit_price` (jednotka `KS`/`LIT`/`KG`/`M`/`PD`) a atribut `OBSAH_BALENI` („100 ks"), `POCET_JEDNOTEK_V_BALENI`. Jednotka `KS` u multipacku je nejistá — `product_packages` zapisuje jen potvrzené počty kusů. |
| Akce a jejich platnost | **Platnost akce Teta neuvádí nikde.** `bbyPrices.acmd` je akční cena, `bbyPrices.sale` sleva v %, `bbyPrices.zcmd` běžná cena. `item.originalPrice` je třetí, vyšší údaj, který se na stránce nezobrazuje → zahazen. Bez konce platnosti není akce deal (CLAUDE.md §15) — uloží se běžná cena, akční cena zůstane v NDJSON záznamu jako `price`/`discountPercent`. |
| Klubu a ceny poboček | Ceny jsou online, řetězcové (`priceScope: CHAIN`, `storeLocationId: null`). Teta nemá v aplikaci pobočky a **nejsou vymyšlené** (CLAUDE.md §14). |

### Dekódování Nuxt payloadu — `lib/ingestion/teta-payload.ts`

Payload je devalue-*flatten*: kořen je `V[0] = ["ShallowReactive", 1]`, klíč slotu je index do pole `V` a **číslo ve slotu je hodnota, ne reference na jiný slot**. Klasický devalue decoder tohle popletne a vrátí cizí objekty (v prototypu se `price` resolvovalo na taxon) — decoder v ANITCE tohle rozlišuje a je na to i fixture test.

Testy: `lib/ingestion/teta-payload.test.ts` běží proti uloženému reálnému payloadu (`lib/ingestion/fixtures/teta-listing-payload.json.gz`, `teta-detail-payload.json.gz`), takže regrese dekodéru se chytí.

### Dvouvrstvý sběr — `lib/ingestion/teta-collector.ts`

1. **Listovací stránky** kategorií → jméno, kód, cena, jednotková cena, dostupnost, kategorie.
2. **Detailní stránky produktů** → balení, značka, popis, atributy.

Sběr je **resumovatelný** (stavový soubor `data/external/teta-collect-state.json` si pamatuá hotové stránky), zapisuje NDJSON (`data/external/teta-catalog-listing.ndjson`, `…-detail.ndjson`) a nikdy nezapisuje do databáze. CLI: `pnpm teta:collect -- --mode=list|detail`, CI: `.github/workflows/teta-catalog-collect.yml` (workflow_dispatch, volitelné pokračování z předchozího běhu).

### Normalizace, import a párování (2026-10-22)

- `lib/ingestion/teta-catalog.ts` — záznam katalogu (haléře → Kč, kategorie, značka, balení, jednotková cena, validace).
- `lib/ingestion/teta-import.ts` — dávkový import (500/řádek) do `products` → `product_packages` → `trade_items` → `retailer_product_refs` → `prices`; **dry run je default**, `--apply` zapisuje.
- `lib/product-identity-teta.ts` — párování s existujícími produkty: blokování přes `pg_trgm` nad `products.search_name`, deterministický skórer, **automatické spojení jen při jednoznačné shodě**, jinak `review_required` s reportem v `data/external/teta-identity-review.json`.
- Migrace `0116_teta_source.sql` — `product_source` enum += `teta`, `stores.chain = 'Teta'`.
