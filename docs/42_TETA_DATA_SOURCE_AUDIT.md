# Teta drogerie data-source audit

**Audit date:** 2026-10-19  
**Status:** historical feasibility evidence exists, but current access and the required representative product sample could not be re-verified. No connector or database changes are approved by this audit.

## Summary

A repository audit dated 2026-09-23 records that Teta product pages were then accessible without authentication and contained server-rendered Schema.org `Product`/`Offer` JSON-LD. It records 36,834 product URLs in a sitemap and these fields on a sampled page: `sku`, `brand.name`, `category`, `offers.price`, `priceCurrency`, `availability`, and `priceValidUntil`. It also records that `/price` and `/api/` were disallowed in `robots.txt`; a browser capture saw `/api/v2/shop/redirects`, which was unrelated to prices.

Those are dated observations, not a current guarantee. On 2026-10-19, attempts to retrieve `robots.txt` and the home page failed because this environment could not resolve `www.tetadrogerie.cz`. The browser transport was unavailable as well. The required live sample of at least 20 products was therefore **not completed** (0 products fetched in this audit). No current sitemap URL, current product count, category coverage, current data fields, pagination behavior, or retailer terms were verified. A connector must not be implemented or run on the strength of the historical, single-page observation.

The old sitemap count is a count of reported URLs, not a measured number of unique, active products. It must not be used as a deduplicated catalog-size claim.

## Scope and evidence levels

Evidence in this report is labeled as:

- **Historical observation:** preserved in `docs/01_CURRENT_STATE.md` (2026-09-23) and `docs/07_CHANGELOG.md`; it was not reproduced today.
- **Current attempt:** the HTTP client could not resolve the retailer hostname; Playwright's browser service returned a transport error. No response body or endpoint schema was obtained today.
- **NEOVĚŘENO:** no evidence sufficient for a conclusion is available. Missing data on one page is not evidence that a field is absent from the catalog.

No `.env` or credential files were inspected. No database was queried or modified.

## Requested pages and observed endpoints

| URL / path | Purpose or result | Evidence and status |
|---|---|---|
| `https://www.tetadrogerie.cz/` | Homepage / discover navigation | Current request failed at DNS resolution. Historical check details are not recorded. **NEOVĚŘENO currently.** |
| `https://www.tetadrogerie.cz/eshop/produkty` | Product catalog entry | Current request failed at DNS resolution; route behavior was not preserved in the prior audit. **NEOVĚŘENO.** |
| `https://www.tetadrogerie.cz/eshop/produkty/Deti` | Children category | Current request failed at DNS resolution. **NEOVĚŘENO.** |
| `https://www.tetadrogerie.cz/akce` | Offers page | Current request failed at DNS resolution. **NEOVĚŘENO.** |
| `https://www.tetadrogerie.cz/robots.txt` | Crawl permissions and sitemap declarations | Current request failed at DNS resolution. The 2026-09-23 repository audit reports `/price` and `/api/` disallowed and `/eshop/katalog/<slug>` pages allowed. Re-fetch and re-check before any crawl. |
| Teta product sitemap | Product URL discovery | Historical audit reports 36,834 product URLs but does not preserve the sitemap's exact URL or response. Its current location and contents are **NEOVĚŘENO**; do not guess a sitemap path. |
| `https://www.tetadrogerie.cz/eshop/katalog/<slug>` | Product detail page | Historical observation: an allowed path pattern whose server-rendered HTML contained Product/Offer JSON-LD. The exact sampled URL and response fixture are not preserved. Current response and pattern are **NEOVĚŘENO**. |
| `/api/v2/shop/redirects` | Redirect mapping | Historical browser capture identified this as unrelated to prices. It is under the historically disallowed `/api/` path and must not be used by a crawler. Do not request it. |
| `/price` and `/api/` | Restricted paths | Reported disallowed for all crawlers by the historical `robots.txt` check. Do not crawl these paths; the denial does not prove whether any usable API exists. |

The only historical rendering conclusion is that structured product data was present in server-rendered HTML without needing to deserialize client state. The framework/platform, behavior of the requested catalog routes, client-side requests, filtering, sorting, pagination, and load-more mechanism were not retained with enough evidence to state. No product API endpoint has been verified as usable; the redirect-mapping endpoint is not a product or price source.

## Product field coverage

The statuses below describe the strength of the available evidence, not a conclusion that a field does or does not exist across the catalog. The historical page observation is a single page and is not the requested cross-category sample.

| Field | Status | Evidence / limitation |
|---|---|---|
| Internal ID | ČÁSTEČNĚ | Historical Product JSON-LD reportedly had `sku`; uniqueness and stability across time were not tested. |
| Full product name | NEOVĚŘENO | The previous audit does not preserve the value or sampled JSON-LD. |
| Brand | ČÁSTEČNĚ | `brand.name` was reported on the one historical page; catalog-wide coverage and normalization are unknown. |
| Source category | ČÁSTEČNĚ | `category` was reported on that page; category path/tree and mapping are unknown. |
| Subcategory | NEOVĚŘENO | No preserved nested category structure. |
| EAN / GTIN | NEOVĚŘENO | No GTIN field or value is recorded for Teta. `sku` must not be treated as an EAN. |
| Package quantity / unit | NEOVĚŘENO | No package quantity or unit evidence was preserved. |
| Regular price | NEOVĚŘENO | A regular/reference price distinct from the current offer price was not recorded. |
| Current price | ČÁSTEČNĚ | `offers.price` and `priceCurrency` were reported in the historical JSON-LD; no sample value or current response is available. |
| Normalized unit price | NEOVĚŘENO | No unit-price value or derivation inputs recorded. |
| Club price | NEOVĚŘENO | No member-price field, membership requirement, or terms verified. |
| Promotional price | ČÁSTEČNĚ | The historical `Offer` exposed a price, but its relationship to a regular price or promotion was not established. |
| Promotion terms / multi-buy | NEOVĚŘENO | No offer conditions or quantity tiers preserved. |
| Promotion validity | ČÁSTEČNĚ | `priceValidUntil` was reported in the historical Offer. No start date or semantic validation was preserved. |
| Image URL | NEOVĚŘENO | No image field/value preserved. |
| Canonical product URL | ČÁSTEČNĚ | Historical product pages followed `/eshop/katalog/<slug>`; no exact URL or canonical-tag behavior preserved. |
| Online availability | ČÁSTEČNĚ | `offers.availability` was reported for one page. The exact value and current meaning are unknown. |
| Other parameters | NEOVĚŘENO | No preserved attributes or parameter completeness evidence. |

`ČÁSTEČNĚ` means the field was reported on the historical single-page inspection only; it does not establish availability on a representative share of products.

## Sampling and assortment coverage

| Requested area | Current products fetched | Result |
|---|---:|---|
| Cosmetics and skin care | 0 | NEOVĚŘENO |
| Hair and body | 0 | NEOVĚŘENO |
| Hygiene | 0 | NEOVĚŘENO |
| Baby goods and diapers | 0 | NEOVĚŘENO |
| Cleaning and laundry | 0 | NEOVĚŘENO |
| Household | 0 | NEOVĚŘENO |
| Food | 0 | NEOVĚŘENO |
| Pet supplies | 0 | NEOVĚŘENO |
| Stationery and seasonal | 0 | NEOVĚŘENO |

The 0-product count is for this audit's live attempt, which stopped at DNS resolution; it is not a finding that these categories have no products. The historical sitemap figure (36,834 URLs on 2026-09-23) is neither current nor deduplicated. No URL normalization, product-ID collision, duplicate-across-category, or unique-product measurement was possible. Completeness of a catalog crawl and availability of a sitemap index or child sitemaps remain **NEOVĚŘENO**.

## Prices, offers, and physical stores

The only recorded price evidence is an `offers.price` / `priceCurrency` pair and `priceValidUntil` in the historical product-page JSON-LD. The audit did not preserve whether that price was the everyday price, a public promotion, or a member offer. No evidence supports extracting a separate regular price, club price, club eligibility, flyer linkage, promotion start date, multi-buy tier, or reliable unit price. Do not synthesize missing price/validity information.

A historical secondary-source statement that e-shop prices are the same as physical-store prices is not a verified per-branch price feed. No current store directory, branch identifier, store-selection flow, branch-specific stock, or physical-store price endpoint has been verified. Online availability must not be interpreted as stock at a specific branch.

If later approved, store an e-shop observation as an explicitly online/chain-level price with no physical `store_location_id`; represent a physical-store price only when the source identifies that location and price context. The existing `stores`, `store_locations`, `prices.price_scope`, `prices.source_type`, `prices.source_reference`, and `deals` model can distinguish chain/online observations from branch-scoped data (see `lib/db/schema.ts`).

## ANITKA integration findings and conditional design

The repository already has the relevant ingestion pipeline: connector-specific fetch/normalize/validate, then shared persistence in `lib/ingestion/ingest.ts`. `PriceConnector` requires a typed source enum, stable `externalId`, normalized units/prices and optional dated deals (`lib/ingestion/types.ts`). `product_external_refs` uniquely identifies a source plus external ID; `prices` preserves official observations and dates; `product_packages` stores normalized package facts (`lib/db/schema.ts`). Product identity and taxonomy must continue to use the existing catalog, not a Teta-specific product table.

The existing `product_source` enum has no `teta` value (`lib/db/schema.ts`). Consequently, even a later connector would need a reviewed additive migration and the normal store seed/configuration. That is intentionally not included here. Existing categorization already has fixed category/subcategory/type/subtype registries; source categories should map only when evidence supports an unambiguous match. Unresolved cases should be skipped or surfaced for review, not turned into new product types from names.

If current public access is re-established and a fixture-backed sample validates the source, the smallest viable approach to evaluate is:

1. Re-fetch `robots.txt` first and retain the exact sitemap declaration and allowed product URL patterns. Do not query `/price` or `/api/`; do not use unverified endpoints.
2. Obtain at least 20 distinct product pages from multiple requested categories through the allowed, sitemap-discovered URLs. Save sanitized, representative HTML fixtures and field-presence counts; check duplicates and stable IDs without assuming `sku` is an EAN.
3. Parse only the verified server-rendered structured data and validate its values against visible page content where possible. Treat regular, promotional, and club prices as separate facts only when the page explicitly distinguishes them. Do not infer dates or local stock.
4. If the evidence supports an adapter, reuse the existing connector and shared write path. Use source + stable external ID first; match by valid EAN only after validating the check digit and package identity. Never merge on name alone.
5. Add a fixture-only parser/normalization test suite, safe `dry-run`, product limit, request timeout, conservative rate limit, per-product error counts, and resumable/idempotent writes before any separately approved import. Do not delete products when a page fails.
6. Keep an online/chain price separate from branch-scoped prices. Add no cron or automatic production execution without separate evidence and approval.

**Feasibility:** the historical evidence suggests HTML/JSON-LD could be a simpler source than a private API, but current feasibility is **not established**. If 36,834 pages were still present and only one detail page were needed per product, a complete catalog read would require up to that many page requests before retries; no rate, response size, runtime, terms, or sustainable refresh cadence has been measured. Start with a small, explicitly permitted sample, not a full crawl.

## Validation and open questions

- Current page access: blocked by DNS resolution failure in this environment; browser transport also unavailable.
- Required live product sample: not run; 0/20 products fetched.
- Current robots/sitemap and exact sitemap URL: NEOVĚŘENO.
- Current JSON-LD shape, field coverage and cross-category consistency: NEOVĚŘENO.
- Framework, listing pagination/filter/sort, and complete-catalog discovery: NEOVĚŘENO.
- EAN availability, package normalization, regular/club prices and reliable promotion windows: NEOVĚŘENO.
- Branch directory, local stock and branch-specific prices: NEOVĚŘENO.
- Retailer terms and allowed request rate: NEOVĚŘENO; resolve before automating access.
- Tests: no application tests run; this change is an audit document only. The audit makes no network-dependent test or production database change.

## Repository references

- Prior Teta observations: `docs/01_CURRENT_STATE.md` (2026-09-23 entry) and `docs/07_CHANGELOG.md` (2026-09-23 retailer-source research entry).
- Shared importer: `lib/ingestion/types.ts`, `lib/ingestion/ingest.ts`, `lib/ingestion/http.ts`.
- Product identity and external references: `lib/db/schema.ts`, `lib/db/queries.ts`, `docs/34_CATALOG_IDENTITY.md`.
- Price history and retailer source registration: `lib/db/schema.ts`, `lib/db/migrations/`.
- Taxonomy: `lib/product-subcategories.ts`, `lib/product-types.ts`, `lib/product-subtype-registry.ts`.
