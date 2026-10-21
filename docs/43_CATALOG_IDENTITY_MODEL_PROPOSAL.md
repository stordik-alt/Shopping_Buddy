# Návrh datového modelu identity katalogu

**Stav: první implementační fáze připravena v PR; migrace je aditivní a čeká na CI/review. Bez produkčního importu.**  
**Rozsah:** katalog ANITKY, interní kódy řetězců, varianty, balení a volitelné GTIN/EAN.  
**Související dokumenty:** `docs/12_PRODUCT_TYPES.md`, `docs/34_CATALOG_IDENTITY.md`, `docs/42_TETA_DATA_SOURCE_AUDIT.md`.

## 1. Cíl a hlavní rozhodnutí

EAN/GTIN nesmí být povinný pro založení produktu. Identita musí fungovat i pro Tetu, jejíž testovaný vzorek 300 produktů neobsahoval žádný EAN.

Je nutné odlišovat čtyři úrovně:

1. **Product type / subtype** — taxonomická klasifikace, např. mléko → trvanlivé mléko. Není identitou konkrétního výrobku.
2. **Product** — kanonická identita konkrétní varianty výrobku, např. konkrétní značka a příchuť. Nejen obecný druh zboží.
3. **Trade item / balení** — konkrétní prodejní jednotka, např. 500 ml nebo balení 2 × 500 ml. GTIN se vztahuje k identifikované obchodní jednotce, nikoli automaticky ke všem velikostem téhož výrobku.
4. **Retailer reference** — interní SKU/kód řetězce pro konkrétní záznam v jeho katalogu. Je unikátní jen v rámci zdroje a nikdy se nesmí vydávat za GTIN.

Stávající `products` a `product_packages` zůstávají základem. První implementační fáze přidává `trade_items`, `trade_item_identifiers` a `retailer_product_refs`; stávající `product_external_refs`, ceny a akce se zatím nemění. Nové vazby jsou oddělené a volitelné, aby bylo možné nejprve ověřit identitu bez přepisování historie.

## 2. Navrhovaná logická struktura

```text
ProductType → ProductSubtype
                    │
                    ▼
                  Product (konkrétní varianta)
                    │ 1:N
                    ▼
                TradeItem (konkrétní prodejní balení)
                    │ 1:N
          ┌─────────┴─────────┐
          ▼                   ▼
  TradeItemIdentifier   RetailerProductRef
  GTIN/EAN (0..N)       source + external_id
          │                   │
          └─────────┬─────────┘
                    ▼
          Price observations / offers
```

Jedno balení může mít více identifikátorů v čase nebo z různých ověřovacích zdrojů, ale jeden ověřený GTIN nesmí současně označovat dvě aktivní obchodní jednotky v rámci stejného trhu a rozsahu identifikace. Výjimky vyžadující historii se řeší časovou platností, nikoli tichým přepsáním.

## 3. Navržené tabulky a pole

### 3.1 `trade_items` — konkrétní prodejní jednotka

Navržená nová tabulka, pokud audit implementace potvrdí, že `product_packages` nedokáže bezpečně zastat tuto roli.

- `id` UUID, primární klíč.
- `product_id` FK → `products.id`, povinný.
- `package_id` FK → `product_packages.id`, volitelný při neznámém nebo neúplném balení.
- `package_signature` text, normalizovaný popis velikosti a struktury balení, pouze pokud lze bezpečně sestavit.
- `status` — `active`, `discontinued`, `needs_review`.
- `created_at`, `updated_at`.

Omezení:
- Nesmí se vytvářet duplicitní obchodní jednotka pro stejný produkt a ověřenou stejnou strukturu balení.
- Neznámá velikost se nesmí domýšlet z ceny za kus.
- Pokud se ukáže, že existující `product_packages` má již stejnou identitu a jednoznačné vazby, má přednost rozšíření této tabulky před paralelním modelem.

### 3.2 `trade_item_identifiers` — GTIN/EAN a další identifikátory

- `id` UUID.
- `trade_item_id` FK → `trade_items.id`.
- `scheme` — např. `GTIN`; délka se validuje podle pravidel daného identifikačního schématu.
- `value` text, zachovat úvodní nuly.
- `market` — volitelný kód trhu, např. `CZ`.
- `verification_status` — `unverified`, `source_confirmed`, `independently_verified`, `rejected`.
- `verification_source`, `verified_at`, `valid_from`, `valid_until`.
- `created_at`.

Pravidla:
- GTIN se ukládá jako text, nikdy jako číslo.
- Formátová validace včetně kontrolní číslice není totéž jako ověření, že kód skutečně patří výrobku.
- Neověřený identifikátor se nesmí používat jako automatický důkaz pro sloučení.
- Zamítnuté a historické hodnoty se nemažou bez auditní stopy.
- GTIN se vztahuje ke konkrétní obchodní jednotce. Různé velikosti balení mohou mít různé GTIN.

### 3.3 `retailer_product_refs` — reference zdroje na prodejní jednotku

Cílově nahradí nebo rozšíří dnešní `product_external_refs`; migrace nesmí stávající tabulku odstranit bez kontrolované konverze.

- `id` UUID.
- `source` — hodnota z registru zdrojů/řetězců.
- `external_id` text.
- `trade_item_id` FK, volitelný při nevyřešené identitě.
- `product_id` FK, dočasná kompatibilní vazba, pokud obchodní jednotka zatím není určena.
- `source_url`, `first_seen_at`, `last_seen_at`.
- `identity_status` — `unresolved`, `matched`, `review_required`, `retired`.
- `raw_name`, `raw_brand`, `raw_package` pro dohledatelnost původního zdroje.

Omezení:
- Unikátní klíč je `(source, external_id)`.
- Stejný interní kód může existovat u jiného řetězce; zdroj je součástí identity.
- Kód Tety nesmí být ukládán do GTIN.
- Nevyřešená reference se může uchovat pro další kontrolu, ale nesmí způsobit automatické sloučení produktů.

## 4. Identifikační a párovací pravidla

Pořadí řešení reference:

1. Existující `(source, external_id)` — přesná a idempotentní shoda.
2. GTIN se stavem `source_confirmed` nebo `independently_verified`, po ověření obchodní jednotky.
3. Kandidáti podle normalizované značky, názvu, varianty a velikosti balení — pouze návrh shody, nikoli automatické sloučení.
4. Pokud je shoda nejednoznačná, uložit `review_required`.
5. Vytvořit nový produkt/obchodní jednotku jen tehdy, pokud pravidla potvrdí, že nejde o známou identitu.

Název samotný není identifikátor. Ani stejná značka, kategorie nebo cena nejsou dostatečný důkaz. Rozdílná příchuť, složení, koncentrace nebo velikost prodejního balení mohou znamenat odlišnou obchodní jednotku.

## 5. Cenové vazby a zpětná kompatibilita

Současné `prices` a `deals` jsou navázané na `product_id`. Cílově musí být běžná cena i akce přiřaditelná ke konkrétní obchodní jednotce nebo konkrétní retailer reference. Jinak se mohou promíchat ceny dvou SKU se stejným názvem.

Doporučená migrace po etapách:

1. Přidat nové identifikační tabulky a nullable vazby; existující data zůstanou čitelná.
2. Zpětně doplnit obchodní jednotky pouze tam, kde je balení doloženo.
3. Připojit retailer references a ceny bez přepisování historie.
4. Přenést nabídky na přesnou identitu a přidat kontroly duplicit.
5. Přepnout čtení a zápis po ověření parity; až poté zvážit odstranění starých vazeb.

Do dokončení migrace zůstává stávající `product_id` zdrojem pravdy pro legacy řádky. Nový model nesmí měnit ani slučovat existující nákupy, zásoby, historii cen nebo identitu produktů automaticky.

## 6. Příklad bez EAN

Pro Tetu může být uloženo:

- produkt: `Chilly Delicate`, značka `Chilly`, varianta podle doloženého zdroje;
- obchodní jednotka: konkrétní balení, pokud je uvedeno;
- reference: `source=teta`, `external_id=<interní kód Tety>`;
- GTIN: žádný, dokud jej důvěryhodný zdroj neposkytne a neověří.

Produkt i cenu lze evidovat bez EAN. Neznámý EAN není chyba importu; neznámé balení či nejednoznačná varianta mohou naopak vyžadovat kontrolu.

## 7. Kritéria přijetí návrhu

- EAN/GTIN je volitelný.
- Interní kódy jsou oddělené od GTIN a unikátní jen v rámci zdroje.
- Jednoznačná varianta a prodejní balení nejsou zaměňovány za obecný product type.
- Nejednoznačné shody se kontrolují místo automatického sloučení.
- Import lze opakovat bez duplicit.
- Historické ceny a nákupy zůstávají zachovány.
- Nové vazby lze zavést postupně bez výpadku stávajících importů.


## Implementační fáze 2 — vazby cen a akcí

Migrace `0114_link_prices_deals_to_catalog_identity.sql` přidává do `prices` a `deals` volitelné odkazy na `trade_items` a `retailer_product_refs`. Kompozitní cizí klíče kontrolují, že odkazovaná identita patří stejnému `product_id`. Stávající řádky zůstávají na úrovni produktu a nové sloupce mají `NULL`, dokud nebude připraven bezpečný backfill. Neprobíhá automatické párování, přepis historie ani import Tety.


## Implementační fáze 3 — první reálné zápisy (2026-10-22)

Tato tabulky už nejsou prázdné schéma — do `trade_items`, `retailer_product_refs` a `trade_item_identifiers` se poprvé zapisuje skutečná data.

### Teta (`lib/ingestion/teta-import.ts`)

Import Tety zapisuje v tomto pořadí:

1. `products` — kanonický produkt (přes `resolveOrCreateProductFromExternal`, se značkou); při jednoznačné shodě s existujícím produktem se nepřidává nový, ale použije se ten existující.
2. `product_packages` — balení, které Teta sama uvádí (`OBSAH_BALENI`).
3. `trade_items` — obchodní jednotka: jeden řádek na produkt a balení (jednoznačný klíč tabulky), `package_signature` jako `zdroj:velikost`.
4. `retailer_product_refs` — reference Tety: `source='teta'`, `external_id=<15místný kód Tety>`, `identity_status` podle párování (`matched` / `review_required` / `unresolved`).
5. `prices` — běžná cena (`regularPrice`) v rozsahu `CHAIN`, `source_type='OFFICIAL'`, `store_location_id=NULL` (Teta nemá v aplikaci pobočky a nevymýšlíme je). Akční cena se neukládá jako deal, protože Teta neuvádí její platnost.
6. `prices.trade_item_id` a `prices.retailer_product_ref_id` — cena je dohledatelná zpět ke SKU, ze kterého přišla.

### GTIN z DM (`lib/ingestion/gtin.ts`, `lib/ingestion/dm.ts`, `lib/db/queries.ts`)

DM ve svém tile API publikuje EAN ke každému SKU — doposud se zahazovalo. Teď:

- `NormalizedProduct` má volitelné `ean`; DM ho předává po kontrole formátu (délka 8/12/13/14 a **kontrolní číslice**). Vadný kód se zahodí, **produkt zůstává** — chybějící EAN nikdy import neblokuje.
- `persistTradeItemBarcodes()` zapíše GTIN na obchodní jednotku daného SKU (`package_signature = 'dm:<dan>'`) se stavem `source_confirmed`, trhem `CZ`.
- Barcode patří **jedné** obchodní jednotce: GTIN, který už vlastní jiná jednotka, se nezapíše podruhé (partial unique index `(scheme, value, market)`) a je to nahlášeno jako konflikt, ne přepsáno.
- Teta GTIN nemá — zdědí ho přes sdílený kanonický `products` řádek, na který ukazuje DM jednotka. To je důvod, proč se páruje na produktové úrovni a ne na úrovni obchodní jednotky.
