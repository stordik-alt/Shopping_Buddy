# Shopping Buddy — Current State

**Repository:** `stordik-alt/Shopping_Buddy`
**Stable branch:** `main`
**Current backend development branch:** `v0/backend`
**Previous frontend branch:** `V0/continue-frontend` — historical/obsolete unless explicitly requested
**Last updated:** 2026-09-23

---

# 1. Project Overview

Shopping Buddy is a family shopping assistant focused initially on the Czech market.

The application combines:

* household management
* family profiles
* shopping lists
* product catalog
* store directory
* prices
* promotions
* meal planning
* budgets
* expenses
* purchase history
* shopping optimization
* notifications
* shared household functionality

The long-term goal is to provide intelligent shopping assistance based on reliable household, product, price and purchase data.

The AI Shopping Assistant is intentionally planned as the final major development phase.

---

# 2. Current Git State

## Stable branch

```text
main
```

`main` is the stable project branch.

## Current backend development

```text
v0/backend
```

Backend development should be performed on this branch.

The branch should be based on the latest stable `main`.

Development flow:

```text
main
  ↓
v0/backend
  ↓
development
  ↓
testing / validation
  ↓
pull request
  ↓
main
```

## Historical branch

```text
V0/continue-frontend
```

This branch was used during the earlier frontend-development phase.

It is no longer the active development branch.

Do not use it for new backend development unless explicitly requested.

---

# 3. Technology Stack

Current application stack:

* Next.js 16.3.3
* React 19
* TypeScript 5.7.3
* Tailwind CSS 4.x
* shadcn/ui
* lucide-react
* pnpm 12.3.4
* Neon PostgreSQL 18
* Drizzle ORM
* Neon Auth

The application uses Next.js as the application/backend framework.

There is no separate Python/FastAPI backend.

SQLite is not used as the production database.

---

# 4. Frontend Status

The original frontend prototype has been substantially connected to persistent backend functionality.

The UI remains mobile-first and responsive.

The frontend currently contains functionality for areas including:

* dashboard
* household/profile
* shopping lists
* budget
* expenses
* stores
* prices
* promotions
* meal plans
* notifications
* shared household functionality

Existing UI should be preserved when working on backend functionality unless a UI change is required.

**Update 2026-09-22, mobile horizontal overflow.** Earlier the same day, two blanket fixes landed (`overflow-x: clip` on `body` and `<main>`) to stop the whole page from horizontally scrolling on mobile, plus a touch-target/mobile-nav pass (`components/shared/mobile-nav.tsx`, `nav-item.tsx`). The owner reported the underlying complaint was still there: *"texty přetékají pryč z obrazovky, nechci rollovat"* (text overflows off the screen, I don't want to scroll). Investigated hands-on with a real headless-browser session at a 375px mobile viewport, checking every tab's actual DOM (any element whose right edge exceeds the viewport, not just `document.documentElement.scrollWidth`) rather than trusting the earlier fix — the `overflow-x: clip` fix explained why the *page* never scrolled, but didn't explain what was happening to content that would have overflowed: it was invisibly clipped, not wrapped, which is worse than scrolling for reachability.

Found the real cause: `components/shopping/shopping-list.tsx` had two `flex ... overflow-x-auto` rows — the category filter chips (Vše/Potraviny/.../Ostatní) and the shopping-list tab switcher — each meant to scroll horizontally within itself. At 375px width, the category row's last two chips ("Domácnost", "Ostatní") landed off-screen; "Ostatní" specifically was **not just visually cut off but functionally unreachable** — no visible scrollbar or affordance hinted a horizontal swipe would reveal it, so that category filter was effectively broken on mobile. Fixed by switching both rows from `overflow-x-auto` to `flex-wrap` — every chip now wraps onto additional lines instead of requiring a scroll, matching the owner's explicit "no scrolling" preference; confirmed via the same automated per-element check (re-run across all 6 tabs, plus an expanded shopping-item detail row) that zero elements now exceed the viewport anywhere in the app. No other `overflow-x-auto` patterns existed elsewhere in `components/`.

---

# 5. Authentication

Authentication is implemented using Neon Auth.

Current behavior includes:

* email/password authentication
* protected application routes
* authenticated session handling
* server-side user identification
* household-level authorization

Protected routes are handled through the existing Next.js proxy/authentication flow.

The application must not trust client-provided user or household identifiers for authorization decisions.

---

# 6. Household Model

Household functionality is implemented.

The application supports:

* household creation
* household profile
* household members
* adults
* children
* household preferences
* household-scoped data

Database operations are scoped to the authenticated household.

One account belongs to exactly one household, enforced by a unique index on `household_members.user_id` (migration 0014, 2026-09-24; members without an account have a NULL `user_id` and are unaffected). The household is created on first login by `createHouseholdForUser` (`lib/db/queries.ts`), which writes the membership row last with `ON CONFLICT DO NOTHING`, so concurrent first-login requests converge on a single household instead of each creating one.

Important household-related data includes:

* profiles
* children
* preferences
* shopping lists
* budgets
* expenses
* purchases
* meal plans
* notifications

---

# 7. Shared Household

Shared household functionality has been implemented.

Current functionality includes:

* household invitations
* membership records
* invitation links
* joining an existing household
* owner/member roles

The current synchronization approach uses lightweight refresh/polling rather than websocket infrastructure.

The application currently uses:

* periodic refresh
* tab-focus refresh

This is considered sufficient for the current development stage.

Realtime websocket infrastructure should not be introduced unless a concrete requirement appears.

---

# 8. Database

The production database is:

```text
Neon PostgreSQL
```

Database access is handled through:

```text
Drizzle ORM
```

The database contains the main application domains.

Current schema includes tables/entities for:

* households
* household_members
* profiles
* children
* preferences
* product_categories
* products
* product_external_refs
* stores
* store_locations
* prices
* deals
* shopping_lists
* shopping_list_items
* budgets
* expenses
* purchases
* purchase_items
* meal_plans
* notifications
* invitations

Neon Auth also maintains its own authentication-related schema.

The obsolete `public.users` application table has been removed.

---

# 9. Database Migrations

Migration tooling is implemented.

The project uses Drizzle migrations.

The current baseline migration was generated using:

```text
drizzle-kit generate
```

Baseline migration:

```text
lib/db/migrations/0000_baseline_snapshot.sql
```

Migration runner:

```text
lib/db/migrate.ts
```

Migration command:

```bash
pnpm db:migrate
```

The migration runner supports the project's migration statement-breakpoint format.

Database schema changes should always be accompanied by appropriate migrations.

**Important limitation, found and worked around 2026-09-23:** `lib/db/migrate.ts`'s `_migrations` tracking table records applied migrations by **filename only**, not by content hash. A prior uncommitted change had deleted an already-applied migration (`0006_fearless_thunderbolt.sql`, combining a decimal-quantity change and `products.default_location`) and replaced it via `drizzle-kit generate` with four differently-named files (`0006_receipt_ocr_provider.sql`, `0007_decimal_purchase_quantities.sql`, `0008_dynamic_receipt_stores.sql`, `0009_product_default_location.sql`). Because the tracker only knows filenames, all four ran for real against the dev database (new names it hadn't seen), on top of a database that already had the equivalent columns from the deleted migration. Three of the four were harmless. The fourth, `0007_decimal_purchase_quantities.sql`, wasn't: its `ALTER COLUMN quantity TYPE numeric USING quantity::numeric` (no precision) should have downgraded `purchase_items.quantity`/`pantry_items.quantity` from `numeric(10,3)` to unconstrained `numeric` — confirmed via a disposable scratch table that this ALTER really does strip precision — yet the live dev database still had `numeric(10,3)`, matching what the deleted migration had actually set. The only explanation: the file's on-disk content had been edited (via a later `drizzle-kit generate` re-run, evidenced by the modified `meta/0006_snapshot.json`/new `meta/0009_snapshot.json`) *after* it had already run, so what's on disk no longer matches what actually executed. Since the tracker never revisits an already-recorded filename, this drift would only surface when the migration set is next replayed on a *fresh* database (a new Neon branch, staging, or production) — it would silently produce unconstrained `numeric` there instead of today's dev `numeric(10,3)`. Fixed by restoring explicit `numeric(10, 3)` in both `0007_decimal_purchase_quantities.sql` and `lib/db/schema.ts` (`purchaseItems.quantity`/`pantryItems.quantity`), and updating `meta/0009_snapshot.json` to match — verified with `drizzle-kit generate` reporting "No schema changes, nothing to migrate" afterward. No DB change was needed (the dev database was already correct); this only fixes what a fresh apply would produce. **Takeaway for future migration edits:** never edit a migration file after `pnpm db:migrate` has already applied it — this tracker has no way to detect or re-apply a changed file, so the fix must always be a *new* migration, never a silent edit to an old one.

---

# 10. Store Directory

Store directory functionality is implemented.

Initial supported Czech store chains include:

* Lidl
* Albert
* Kaufland
* Billa
* JIP
* Penny

The store model distinguishes between:

```text
Store chain
    ↓
Store location
```

Real store locations have been added to the database.

**Update 2026-09-23:** The receipt OCR pipeline now creates a physical `store_locations` row when OCR provides an address for a branch that is not yet in the directory. The chain is still stored in `stores`; the new branch is linked by `store_id` and immediately assigned to the receipt/purchase/receipt price observations. Coordinates and opening hours remain NULL until a trusted store-directory source enriches the branch; the OCR pipeline never invents them. A normalized chain + address + city unique index prevents repeated imports from creating duplicate branches.

The current database contains approximately:

```text
55 store locations
```

covering multiple Czech cities and regions.

The store directory was expanded using real geographic/store data.

Fabricated store locations must not be added.

---

# 11. Geographic Store Data

**Update 2026-09-25, every branch of our chains from OpenStreetMap (migration `0027`).** Before, `store_locations` held 62 branches (seeded, mostly Prague, plus some created from receipts). `pnpm db:import-stores [--apply]` (`scripts/import-stores.ts`) and a weekly cron (`/api/cron/import-stores`, Mondays 03:00 UTC) import the branches of Albert, Billa, dm, JIP, Kaufland, Lidl, Penny and Tesco from OpenStreetMap: `lib/stores/overpass.ts` (fetch: two light Overpass queries — the branches, then address points within 60 m of those mapped without a full address — over three public instances in turn) → `lib/stores/osm.ts` (pure: brand → chain, address completed from the nearest address point, validation, branch name like "Lidl Budějovická") → `lib/stores/sync.ts` (pure plan) → `lib/db/store-directory.ts` (write). **Nothing is invented:** a map point without an address stated by the data itself is rejected and counted; a point outside Czechia too. **Idempotent:** `store_locations.source` + `external_id` (`node/123`), unique; a repeat import updates changed branches and only stamps `last_seen_at` on the rest. **Existing branches are adopted, not duplicated:** a seeded or receipt branch of the same chain within 150 m, or at the same address, takes the map's GPS, opening hours and id but keeps its own id (purchases, prices and chosen stores point at it), name and address. **Nothing is deleted:** a branch the map no longer lists keeps an old `last_seen_at`. Opening hours are kept in OSM syntax (`opening_hours`) and shown in Czech (`formatOpeningHours()`: "Po–So 7:00–21:00 · Ne 8:00–20:00"; anything richer is shown unchanged). **Licence:** ODbL — the store directory shows "© přispěvatelé OpenStreetMap" with a link. **UI:** the profile's branch picker ("Moje obchody v okolí") now searches a chain's branches by town or street (diacritics-insensitive, picked ones always shown, at most 20 at a time — `visibleBranches()`), since a chain can have hundreds. **Known:** map coverage per chain (2026-09-25, before address completion): Penny 423, Albert 350, Lidl 327, Billa 269, dm 201 (about three quarters of its real branches), Tesco 153, Kaufland 148, JIP 3; the public Overpass servers were overloaded that day and refused even the light queries at times — a failed import writes nothing and the next weekly run retries. **Status when written:** a dry run on the branches alone (without the address step, which the busy servers refused) found 728 branches with their own full address and paired 47 of the 62 existing ones correctly; the first import with `--apply` had not run yet.

Store locations can contain geographic information.

The application supports location-aware functionality for store discovery and shopping optimization.

Recent work included:

* GPS/manual location handling
* store location filtering
* nationwide store directory expansion
* distance-aware shopping logic

The application should remain functional when precise GPS information is unavailable.

Manual location selection should remain supported.

---

# 12. Products

Product data is persisted in Neon.

The product model is intended to support:

* product identity
* category
* brand
* variant
* package size
* unit
* normalized quantity
* barcode/external identifier where available

Product normalization is still an important area of ongoing development.

Before serious price aggregation and comparison, products from different sources must be mapped to stable internal product identities.

Product display names alone must not be treated as reliable unique identifiers.

**Update 2026-09-21:** Found that this rule was actually being violated — `shoppingListItems.productId` and `purchaseItems.productId` have existed in the schema since early on, but no code ever populated or read either one; the whole app instead matched a shopping-list item to catalog data via exact string equality on its free-text name (`item.name === product.productName`), case-sensitively, with no autocomplete/picker UI to keep the typed text aligned with the catalog. First fix: `addShoppingItemAction` now resolves the typed name to a real product via `lib/products.ts`'s `matchProductByName()` (case/whitespace-insensitive, no fuzzy/typo tolerance — a match is exact or it doesn't happen) and stores the real `productId` on insert; the deal-alert check also now matches on the resolved canonical catalog name rather than the raw typed one, so a differently-cased entry no longer silently misses a real deal. Second: the shopping-list input now offers native browser autocomplete (`<datalist>`) against the real catalog, so a suggestion can be picked instead of relying on exact free-text typing — verified in a real browser session (see section 22). `purchaseItems.productId` is still unused — there's no Server Action that writes a real purchase record yet at all (separate, larger gap; see section 21). Brand/variant/package-size/barcode columns are still not modeled — deliberately deferred until there's a reliable name→product link to attach them to, which is what this closes.

**Update 2026-09-23:** Investigated the "brand/variant/package size" gap above to scope real work on it — the real catalog only has 11 products today, none with more than one package size, confirming it's still genuinely blocked on missing real data, not just an oversight. While there, found and fixed a real, live bug in a *different* piece of unit correctness that doesn't have that blocker: `lib/db/queries.ts`'s `upsertProductCatalogDefaults()` — called whenever a household confirms a manual receipt entry or completes a review — was unconditionally overwriting an already-cataloged product's `defaultUnit` with whatever unit that one purchase happened to be recorded in. Since `components/budget/receipt-import.tsx`'s manual-entry form defaults every new row to `'ks'`, this silently downgraded "Mléko polotučné" from its correctly-seeded `l` to `ks` in the real dev database the first time anyone confirmed a milk purchase without remembering to change the unit dropdown — breaking any Kč/l-style unit-price comparison for it from then on. Unlike category/location (genuine human corrections the catalog should learn from), a receipt's unit reflects how *that specific purchase* was rung up, not a correction to the product's identity, so it's not a trustworthy signal to overwrite the catalog with. Fixed: `defaultUnit` is now only set when a product is first inserted into the catalog, never overwritten on an existing one. Also fixed `app/actions/shopping.ts`'s `addShoppingItemAction`, which — unlike its existing category inheritance — always left a quick-added item's unit at the schema default `'ks'` even for a known catalog product; it now inherits `defaultUnit` from the matched product the same way it already inherits category. The corrupted "Mléko polotučné" row in the dev database was corrected back to `l`. 2 new regression tests (`app/actions/receipts.test.ts`, `app/actions/shopping.test.ts`); 232/232 tests passing (up from 224), `tsc --noEmit`/`next build` clean.

---

# 13. Prices

Price data is persisted in Neon.

The current application can read product prices from the database.

Existing frontend code has been connected to database-backed price retrieval.

The application must distinguish between:

```text
current price
```

and:

```text
historical price
```

**Update 2026-09-23:** Price storage was upgraded from a branch-only snapshot model to an explicit immutable observation model. Migration `0010_price_observation_model.sql` has now been applied successfully to the production Neon database, so the deployed application code and production schema are synchronized. Each observation now keeps the retailer chain, optional physical branch, scope (STORE / STORE_FORMAT / REGION / CHAIN), source (RECEIPT / OFFICIAL / FLYER / API / OTHER), location-resolution state, observation date, validity window, optional source reference and optional confidence. Existing branch-linked rows are backfilled with their chain ID and remain STORE + RESOLVED. A receipt whose branch is unknown can therefore be stored as STORE + store_id + NULL location + UNKNOWN without being converted into a CHAIN price. `getProductPrices()` derives the current value from the latest observation in each product/retailer/context group while retaining the full observation history.

Price records include currency information.

The default application currency is:

```text
CZK
```

---

# 14. Promotions / Deals

Promotion/deal data is persisted in Neon.

The frontend can read deal information from the database.

Promotion logic has been expanded to consider factors such as:

* discount
* price
* unit price
* promotion quality
* product relevance
* shopping constraints

The system must not assume that every advertised percentage discount represents a genuinely good deal.

Reliable historical promotion data remains an area for further development.

---

# 15. Internet Price and Promotion Data

A major next-stage objective is connecting Shopping Buddy to external price and promotion sources.

The preferred architecture is:

```text
External retailer/source
        ↓
Fetcher / connector
        ↓
Normalizer
        ↓
Validator
        ↓
Database
        ↓
Price / promotion logic
        ↓
Shopping Buddy
```

Potential data sources include:

* official retailer APIs
* official feeds
* public retailer data
* permitted public websites
* permitted third-party data providers

The application must not bypass:

* CAPTCHA
* authentication
* access controls
* technical restrictions
* other mechanisms designed to restrict access

The application must never invent price or promotion data.

Imported data should retain source and timestamp information wherever available.

**Update 2026-09-23, first real connector (Lidl CZ) implemented:** the architecture above is now real for one source, not just aspirational. `lib/ingestion/lidl.ts` (Fetcher + Normalizer/Validator) pulls from two of lidl.cz's own published, machine-readable surfaces — its product sitemap (`product_sitemap.xml.gz`, declared in `robots.txt`'s `Sitemap:` line) and the JSON endpoint (`/p/api/gridboxes/CZ/cs`) its own product-grid pages call to render prices — neither of which is covered by `robots.txt`'s `Disallow` rules (checked 2026-09-23). No CAPTCHA, login, or access control is bypassed. `lib/ingestion/ingest.ts` orchestrates fetch → normalize/validate → `lib/db/queries.ts`'s `resolveOrCreateProductFromExternal()` (new `product_external_refs` table, migration `0010`) → `recordPriceObservation()`/`upsertActiveDeal()`. A new daily cron, `/api/cron/ingest-prices` (`vercel.json`, same `CRON_SECRET` model as the other crons), runs a deliberately small pilot batch (80 grocery products) rather than the full ~12,000-product catalog, per an explicit owner decision (2026-09-23) to verify stability first.

**Update 2026-09-23, Lidl connector reconciled with the price observation model after merging `main`.** `main` independently upgraded `prices` to an immutable observation model (`price_scope`/`source_type`/`location_resolution`, `store_id`, validity window; its migrations `0010_price_observation_model` and `0011_receipt_auto_create_store_locations`), which changed `recordPriceObservation()`'s signature. After the merge the Lidl ingestion records each price as a **`CHAIN`-scope, `OFFICIAL`-source observation with no physical branch** (`store_location_id` NULL, `sourceReference` = Lidl's `erpNumber`), following `docs/02_PROJECT_CONTEXT.md`'s rule for official chain prices, instead of attaching it to an arbitrary seeded Lidl branch as before — Lidl's site publishes one price per product, not per branch, so claiming a specific branch was never accurate. Consequently it never overwrites a receipt-based `STORE` observation. `deals` are unchanged and still keyed by the seeded canonical Lidl location. The connector's own migration was renumbered `0010_far_the_stranger` → **`0012_product_external_refs`** (both branches had created a `0010`) and made idempotent, because it had already been applied under its old name to the shared Neon database and this project's runner tracks migrations by filename. Verified after the merge: `tsc --noEmit`, `next build`, 277/277 tests, and `drizzle-kit generate` reports no schema changes against the merged snapshot.

**Update 2026-09-23, shared Neon database brought in line with the merged migrations.** Before the merge the database had `0010_far_the_stranger` recorded in `_migrations`, `main`'s `0010_price_observation_model` physically applied but unrecorded, and `0011_receipt_auto_create_store_locations` applied only halfway (the three `DROP NOT NULL`s, but not the unique index). After a read-only audit (every object of 0010 present; no duplicate branches that could block the index; `store_id` and `valid_from` backfills consistent), the missing `_migrations` row for 0010 was inserted by hand and the project's own runner (`lib/db/migrate.ts`) then applied `0011` and `0012_product_external_refs`. **Verified:** an end-to-end receipt-upload simulation afterwards showed the unique index `store_locations_store_address_city_unique_idx` rejecting a duplicate branch, and `prices`/`store_locations` row counts unchanged from before the migrations (103 / 58). **Not re-verified:** `product_external_refs` row count and a second runner pass being all-skips (that check was blocked by the tooling's permission gate and left to the owner). The simulation (real Blob storage, DB and validation; only Google Vision and the model call faked) covered: an automatic import creating a branch with NULL coordinates/hours, address-variant reuse of one branch, duplicate-receipt detection, review-then-confirm, a no-address receipt stored as `STORE` + `UNKNOWN`, and an inconsistent total stopping for review — 8/8 passed and it deleted everything it wrote. Real OCR/model quality on an actual receipt photo, the browser upload flow, and how `CHAIN`+`OFFICIAL` Lidl prices coexist with `STORE`+`RECEIPT` ones were **not** exercised.

Real, hands-on verification (not just unit tests) against the actual dev database found and fixed two real precision problems before trusting the pipeline:
1. A naive substring keyword match (to scope the pilot to groceries, since the sitemap carries no category info) produced real false positives — "olej" (cooking oil) matched inside "petrolejovy" (paraffin, as in a paraffin heater), "mleko" (milk) inside "mlekovar" (a milk-frothing appliance), "kava" (coffee) inside "nepromokava" (waterproof). Fixed by matching whole hyphen-separated slug tokens instead of raw substrings.
2. Even with exact-token matching, Czech kitchenware is routinely named "<gadget> na <food>" — "regál na víno" (wine rack), "strojek na těstoviny" (pasta maker) — so a real, standalone grocery-keyword token can still belong to a non-food product. Fixed with two layers: an explicit accessory-word exclude list on the cheap slug pre-filter, and — the actually authoritative gate — rejecting anything `mapLidlCategory()` doesn't resolve to `'Potraviny'`, using Lidl's own real category from the fetched response, in `normalizeLidlProduct()`.

After both fixes, a redo of the same 80-item pilot batch recorded 75 real grocery products (5 correctly skipped: 2 more kitchenware items the slug filter still let through but the category check caught, 3 real meat cuts sold by scale with no fixed online price) with 0 non-grocery items and 0 errors — verified by inspecting every resulting product/price row, not just trusting the summary counts. Also confirmed product-identity matching works correctly end-to-end: several real Lidl SKUs share an identical simplified display name (e.g. three different `erpNumber`s all titled "Olivový olej extra panenský", likely different pack sizes/batches) and all correctly resolved to the *same* internal `products` row rather than creating duplicates — though this does mean multiple price observations can land for one product on the same day when its variants' prices differ, a real-world consequence of not yet having package-size/variant modeling (the same still-open "Product normalization" gap).

Deliberately not built yet, per the owner's own phased request (2026-09-23, "ceny můžeme získávat tímto způsobem, potom ještě akce z letáků"): promotion data from Lidl's image-based weekly flyers. Not urgently needed either — the same `/p/api/gridboxes/` response already carries real, structured promotion data (`price.discount`, `price.oldPrice`, validity dates) for online-catalog items currently on sale, which `lib/ingestion/lidl.ts`/`upsertActiveDeal()` already captures; true flyer-only promotions (never listed in the online catalog at all) would need image OCR, which — like the receipt-import pipeline — would need its own explicit owner exception to `CLAUDE.md` section 30 before any AI/vision call is added.

Not yet implemented: connectors for the other five Czech chains. `docs/07_CHANGELOG.md`'s exploration entry for 2026-09-23 records what was actually checked — Albert has no live e-shop (discontinued Dec 2025) and its real prices exist only as flyer images; Kaufland's site returns an active Cloudflare CAPTCHA challenge even for a plain `robots.txt` request, which per this section's own rule means it's off-limits without a different, explicitly-permitted access path. **Planned order (owner decision, 2026-09-23): Albert next, then Billa, then Penny, then Kaufland** — see section 27's "External price ingestion" gap entry for the caveats already known for Albert/Kaufland going in.

**Update 2026-09-23, Albert deep-dive — confirmed dead end, including its loyalty app.** Went a level deeper than the initial check: `albert.cz` runs a real persisted-query GraphQL API (`/api/v1/?operationName=...`), observed operations include `FullHeader`, `GetLeaflets`, `RecipeSearch`, and `GetCaptchaInfo` (the last one a signal Albert has CAPTCHA infrastructure wired into its backend, though it didn't block ordinary page browsing). `GetLeaflets` returns only flyer *metadata* (validity dates, store list, a link to a Publitas-hosted viewer/PDF) — no per-product data. Followed that viewer link one level further (`letaky.albert.cz`, no `robots.txt` present on that subdomain either) and found `hotspots_data.json` per flyer page — exactly the mechanism an interactive flyer would use to expose per-product click targets — but every product page's hotspot list came back empty (only the cover page had one hotspot, a plain link back to albert.cz). Albert's flyers are confirmed image-only with no interactive product layer. The owner's follow-up idea — checking "Můj Albert" (Albert's loyalty program, which does show member-specific prices/coupons) — turned out to be a dead end too: it's a **mobile-app-only** feature (the `/aplikace` page on the website is just a download prompt; no web login/account page exists at all). Investigating it further would mean intercepting native mobile app traffic (Android/iOS), not browsing a website — a different category of technique this environment can't currently support (no Android SDK/emulator installed, the host itself already runs inside a hypervisor so nested virtualization is unreliable, no APK obtained) — and even with tooling in place, logging into the app would need a real Czech phone number to receive an SMS verification code, which neither this session nor its environment has access to. Decided not to pursue this further without a human doing the phone verification on their own device. **Albert therefore has no viable structured price source at all right now** — website, GraphQL API, flyer viewer, and loyalty program were all checked.

**Update 2026-09-23, Billa explored — the strongest candidate found so far.** `billa.cz`'s `robots.txt` has no `Disallow` rules at all (just a `Sitemap:` line). That sitemap lists **12,267 real product pages** (`/produkt/<slug>-<sku>`) with a stable numeric SKU in the URL. Unlike Lidl, Billa doesn't expose a separate JSON price API — it's a server-rendered Nuxt.js app that embeds the full page state directly in the HTML via a `<script id="__NUXT_DATA__">` tag (a compact "devalue"-style serialized array with internal index references, not plain JSON — would need the real `devalue` package or equivalent to deserialize properly for a real connector, not the throwaway hand-rolled resolver used for this exploration). Once resolved, one product page's embedded data included: `productId` (UUID), `sku`, `slug`, `name`, `brand.name`, a full category breadcrumb (`parentCategories`), **real package size/unit** (`amount`, `weight`, `packageLabel`, `volumeLabelShort`) — filling exactly the "package size" gap Lidl and this app's own catalog still lack — a resolvable price field (cross-checked: `perStandardizedQuantity: 16760` matched the page's visible "167,60 Kč" per-kg price exactly), plus allergens, full nutrition-facts table, and ingredient list — richer than what Lidl exposes. The page's HTML also contains standard schema.org `Offer` structured data (`"price":41.9,"priceCurrency":"CZK"`) as an escaped string within that same payload, a second, more standard extraction path worth preferring if it proves reliably present across pages. No CAPTCHA or bot-challenge encountered anywhere. Not yet built — this was source discovery only, same as the Lidl research phase before its connector was written.

**Update 2026-09-24, second connector built: Billa CZ, plus a shared connector interface.** `lib/ingestion/types.ts` now defines the `PriceConnector` contract (fetch → normalize/validate) and `lib/ingestion/ingest.ts`'s generic `ingestPrices(connector, limit)` is the single shared persistence step (resolve product via `product_external_refs` → CHAIN/OFFICIAL price observation → dated deal); Lidl was moved onto it unchanged in behaviour (`lidlConnector`, its tests untouched), and `PRICE_SOURCES` lists the connectors the cron runs. A new store needs a connector module, a value in the `product_source` enum (migration; `0015` adds `billa`) and one line in `PRICE_SOURCES`.

Billa (`lib/ingestion/billa.ts`) deviates from the exploration above: instead of deserializing each ~575 KB product page's Nuxt payload, it uses the JSON endpoint the site's own category pages call, `GET /api/product-discovery/categories/<slug>/products?page=<0-based>&pageSize=<=50` (no login, no token, no CAPTCHA; `robots.txt` still has no `Disallow` rules, re-checked 2026-09-24). One request returns up to 50 full product records (price in haléře, `amount`/`volumeLabelShort`, `perStandardizedQuantity` unit price, category paths), so no `devalue` dependency is needed. The pilot batch (80, same owner-set size as Lidl) takes the first page of each of nine top-level food categories, sequentially with a descriptive User-Agent, so it is diverse and stable run to run. Findings that shaped the normalizer:
* **Prices:** `price.regular.value` is the *current* price and `price.standard` (only present during a promotion) the regular one; the regular price is what is recorded, so a promotion never masquerades as the everyday price. Unit prices are converted to Kč/kg, Kč/l or Kč/ks (Billa quotes g/ml goods per 100 g/100 ml).
* **Weight-sold goods:** `weightArticle` items are priced per kg. `weightPieceArticle` items (e.g. chicken quarters) show only the estimated price of one ~855 g piece while the per-kg price is exact — the per-kg price is recorded (unit `kg`), never the piece estimate. A live dry run (2026-09-24, no DB writes) of 77 products first rejected 8 of these as "price disagrees with package size" — correct flagging, then fixed by this rule — and accepted all 77 afterwards.
* **Validation (section 33):** rejects missing sku/name/price, non-food top-level categories, units the app doesn't model, and fixed-weight products whose unit price contradicts price ÷ package size by more than 3 %.
* **Known gap — promotion dates:** Billa publishes **no validity window** for promotions, and `deals.valid_until` is NOT NULL, so promotions are *not* stored as deals (a window would have to be invented). They are counted in the cron response as `promotionsWithoutValidity` (17 of 77 in the dry run). Some are also multi-buy ("od 2 ks"). Needs an owner decision on whether/how to store them (e.g. a separate promo-observation model) before Billa deals reach the UI.
* **Category-page prices are chain-wide web prices**, recorded as CHAIN/OFFICIAL like Lidl's; whether they equal every branch's shelf price is unverified.

The cron (`/api/cron/ingest-prices`) now runs each source in its own try/catch and returns a per-source result; it responds 502 only if every source failed. Migration `0015` was applied to the shared database on 2026-09-24 (with `0016` and `0017`); the first real ingestion (Billa, Penny, DM) ran against it the same day.

**Update 2026-09-24, third connector built: Penny CZ (an offers-only source).** Checked before building, as for Billa: `penny.cz`'s `robots.txt` has no `Disallow` rules, and it runs the same REWE web-shop platform as Billa — the same `/api/product-discovery/categories/<slug>/products` endpoint and product record — so the shared parts (fetch page, haléře → Kč, unit-price conversion, price-vs-package check) moved to `lib/ingestion/product-discovery.ts` and Billa was switched onto it (its tests unchanged). The earlier open question ("does one category payload hold the full product list?") is answered: **Penny's web catalog is not a catalog at all — it is only the current week's offers**, 38 products on 2026-09-24 (the per-aisle categories are the same 38 split up), each with a real validity window (`validityStart`/`validityEnd`, 23.–29. 9.). `lib/ingestion/penny.ts` therefore feeds `deals` with genuinely dated promotions — the thing Billa cannot provide — and records a regular price only where the source states one: `price.standard`, else the struck-through `price.crossed` (unit price scaled by the same ratio). 14 of the 38 offers state a regular price; the other 21 with food are stored as a deal only, since an offer price must never pose as the everyday price. To support this `NormalizedProduct.regularPrice/unitPrice` became nullable and `ingestPrices()` skips the price observation when they are `null`. Live dry run (no DB writes): 35 of 38 normalized (all with a dated deal); the 3 rejected are correctly non-food (2 drugstore, 1 pet food). Validation rejects an offer dearer than the stated regular price, an inverted window, unit-price/package disagreement, and weight-sold items (none seen at Penny, so unverified). Deals are keyed to the canonical seeded Penny branch, exactly as for Lidl; the offers are chain-wide web offers, and whether every branch honours them is unverified. Migration `0016` adds the `penny` enum value (applied 2026-09-24).

**Update 2026-09-24, PDF receipts are read from their text layer before any OCR (owner-approved new dependency: `unpdf`).** Follows from the weighed-line finding: the Albert PDF's OCR text came from the Azure fallback and lacked two weighed lines that the PDF itself contains. `lib/receipt-pdf.ts` now reads a digital PDF's embedded text first (usable = ≥ 60 non-space characters and ≥ 3 two-decimal amounts); otherwise OCR runs as before, and photos are unchanged. New `ocr_provider` value `pdf_text_layer`, shown as "Text přímo z PDF (bez OCR)" (`lib/receipt-ocr-provider.ts`, which also replaces two inline Azure-or-Google ternaries in the receipt screens). On the real receipt the text layer contains all three weight lines with correct diacritics; no OCR call is made. The primary OCR's failure reason is now written to the import's log line when a fallback is used (before, it was lost — which is why the owner could not find why Google had failed). Verified in a real production build (`next build` + `next start`) that `unpdf` bundles and runs. Not done: the historical receipt's data is unchanged (its apples and potatoes stay "1 ks" — the weights were never stored); re-importing that PDF would now read them.

 On the same Albert receipt two weighed items (apples, potatoes) were stored as "1 ks" and the paprika as 0.37 "ks". Root cause: the OCR text for that PDF came from the Azure fallback (Google, the primary PDF OCR, had failed) and lacked the "0.43 x 34.90 Kč" and "0.935 x 19.90 Kč" lines, so the model correctly returned null. Handled deterministically: a fractional quantity with an empty/"ks" unit becomes kilograms (`unitForQuantity()`); a line with neither quantity nor unit price is flagged `unitPriceUnknown` and its total is not recorded as a unit price; the prompt describes weighed lines; and the storage-location gate no longer sends a receipt to review because of an unplaceable rounding line (that test had only passed while the "ZAOKROUHLENÍ" catalog artifacts existed). The rounding artifacts created earlier by the bug were deleted from the shared database (2 purchase items, 2 pantry items, 2 catalog products with their price observation; purchase totals unchanged; `receipt_imports.items` audit JSON left as is). Open: why Google PDF OCR failed in production, and whether to read a digital PDF's embedded text layer before any OCR (see `docs/08_OCR_RECEIPT_PIPELINE.md`).

 Reported by the owner with a real Albert receipt (24 Sep 2026, Brno): the app recorded 886,96 Kč, the receipt says 1 055,00 Kč (2 000 Kč paid, 945 Kč returned). Cause: the parser read `total` = 1055 and `discountTotal` = 168 correctly ("Díky akcím jste ušetřili 168.00 Kč" — a summary; Albert's printed line prices are already the reduced ones and sum to 1 055,00), but `purchases.total` was always "sum of lines − discountTotal", and the consistency check used the same assumption, so the correct receipt went to manual review and the 168 Kč was subtracted on confirmation. Fixed deterministically in `lib/receipts.ts`: `isReceiptConsistent()` accepts both readings, `resolvePurchaseAmounts()` records the receipt's stated total (the amount paid) when it agrees with the lines under either reading, and `isRoundingLine()` keeps the "ZAOKROUHLENÍ PŘÍJEM" line from being imported as a product (it was, into the purchase, the pantry and the catalog). Detail in `docs/08_OCR_RECEIPT_PIPELINE.md`. The affected purchase was corrected in the shared database (886,96 → 1 055,00 Kč, guarded on the old value). Left as they are, pending a decision: the rounding artifacts that the bug already created (a purchase item, two catalog products and two pantry items named "ZAOKROUHLENÍ PŘÍJEM/VÝDEJ", one price observation), and weighed lines (jablka, brambory) that the model records with quantity 1 instead of the weight — a separate parsing weakness.

**Update 2026-09-24, each user chooses the stores in their area (owner request).** Until every branch has GPS, every household member chooses in their own profile ("Moje obchody v okolí") which store chains they have nearby, optionally which specific branches, and how many km they are willing to go for a shop. Before this only a household-wide free-text list existed (`preferences.preferredStores`, unchanged). Decisions (owner-confirmed): **chains and branches**, **per user**, **distance stored and applied later; for now the selection alone filters**.

**Update 2026-09-24, search for specific products at each chain (part 1 of the owner's shopping-planner request).** The owner's request, in three parts: (1) see and search specific products per chain instead of only a store name, (2) plan a shop over at most N stores with priority stores, minimizing cost and showing what is saved where, (3) a bigger catalog to make that meaningful. Decisions (owner-confirmed): item→product matching is a **hybrid** (automatic candidates by text search, the user can pin a specific product — pinning is part 2), the **catalog will be widened**, and **priority stores are preferred until the price difference is large** (part 2). This entry is part 1, the search.

**Update 2026-09-24, shopping planner: where to buy what in at most N stores (part 2 of the owner's shopping-planner request).** "When I write what I need, it only names a store, no items. I don't want one shop split over six stores: I choose how many stores I can go through and which are my priority, and the plan says where to buy what for the least money, and how much is saved by buying an item here and not in the other store." Owner-confirmed rules: item→product matching is a hybrid (automatic pick, or a product the user pinned), and **priority stores are preferred until the price difference is large**.
* **Planner (`lib/shopping-plan.ts`, pure, 35 tests):** given what each item costs at each allowed store, it enumerates every combination of 1..N stores (candidate stores capped at 12) and picks the plan that covers the most items, then costs least. Among plans that cover as much and cost at most the tolerance more — the larger of 5 Kč and 3 % of the cheapest total — it prefers the one with **more priority stores, then fewer stores (no extra trip for a few crowns), then cheaper**; beyond the tolerance price decides. An item no chosen store offers is reported with where it *can* be found, never priced with a made-up number. For every planned item it lists what it costs at the other stores and the difference (positive = dearer there = what buying it here saves; negative = cheaper there but outside the plan). Plan-level facts: saving against the best single store (only when both cover the same items), the floor with no store limit and what the limit costs, and what preferring priority stores cost. Deterministic, tie-broken by store id, independent of input order.
* **Pricing a need (`lib/shopping-offers.ts`):** a need in kg/g or l/ml is priced pro rata by the product's unit price — fair across pack sizes (CLAUDE.md §17); a count in pieces is that many packages at the package price (the pack size is shown, and pinning is how the user picks the size they mean); a weight need against a piece-priced product (or volume against weight) is not comparable and yields no offer. The automatic pick per chain is the best text match, then the cheapest for the need.
* **Data (migration `0021`, applied 2026-09-24):** `household_members.max_shop_stores` (1–6), `member_stores.is_priority` (chain-level rows only, CHECK), and `shopping_list_item_pins` (item, chain, product; one pin per item and chain; cascades). Priority stores and the store count are saved in the profile ("Moje obchody v okolí") and are the planner's defaults.
* **Server:** `buildShoppingPlanAction` (household and member from the session; the allowed stores are the user's chosen stores, or every chain when none are chosen; plans all of the household's open items — the app shows its lists as one list), `pinProductAction` / `unpinProductAction` (item ownership checked through its list; a pin needs a current price at that chain). A pinned product that lost its price falls back to the automatic pick and is reported in the plan's notes.
* **UI:** "Plán nákupu" above the store totals (choose how many stores, mark priority stores, build; result per store with subtotal, lines with the chosen product, package size, a "vybráno vámi" badge for pinned products, alternatives and savings, items not in the plan, insights, an "out of date" hint when the list or pins changed); "Vybrat pro tuto položku v <řetězec>" in the per-item product search; priority and store-count controls in the profile. Verified in a real browser at 360 px (temporary preview page, removed): no horizontal overflow.
* **Known limits:** the plan compares prices, not distances (the distance is still only stored); a piece-count need compares package prices of possibly different sizes; the catalog is ~80 products per chain, so many items find no offer at some chains — widening it is part 3, not done yet; the old per-store totals and the deal notification on adding an item are unchanged.

 of the owner's shopping-planner request).** The owner's request, in three parts: (1) see and search specific products per chain instead of only a store name, (2) plan a shop over at most N stores with priority stores, minimizing cost and showing what is saved where, (3) a bigger catalog to make that meaningful. Decisions (owner-confirmed): item→product matching is a **hybrid** (automatic candidates by text search, the user can pin a specific product — pinning is part 2), the **catalog will be widened**, and **priority stores are preferred until the price difference is large** (part 2). This entry is part 1, the search.
* **Search** (`lib/product-search.ts` pure rules, `lib/db/product-search.ts` query, `searchProductsAction`): accent- and case-insensitive substring search over products that have prices ("mleko" finds "Čerstvé mléko"). `products.search_name` (migration `0020`, applied 2026-09-24) is a stored generated column, `lower(translate(name, …))`, using the same character map as `normalizeSearchText()` — a DB test checks the two agree for every mapped character. Words in the query are required; a token with a digit ("1l", "250", "1,5%") is only a rank booster, because names often omit sizes (Lidl's "Mléko polotučné" has none) and requiring them returned nothing. Ranking: whole word > word start > inside a word, a name starting with the first token, an exact name. At most 6 tokens / 80 characters, LIKE wildcards escaped and everything parameterized (tested with quote-like input).
* **Results** are grouped per chain (up to 8 each, "…a dalších N"), each with the latest recorded price (docs/03_DATABASE.md rule 14), the chain's active promotion and its unit price scaled by the same ratio, and the date the price was observed. Unit prices per gram/millilitre are shown per kg/l (the Lidl data holds "0,10 Kč/g"). A hit at a chain with only receipt-derived prices is shown too, with its date.
* **Scope:** limited to the user's chosen chains (previous entry) with a switch "Jen mé obchody v okolí", off by default only when they have chosen none; from a list item the search is restricted to the item's category (so "mléko" for a food item does not offer body milk), the global search tags non-food hits.
* **UI:** "Hledat produkty v obchodech" above the shopping list and "Najít v obchodech" inside each expanded item (prefilled with its name). Debounced, only the latest request may update the screen, loading/empty/error states; verified in a real browser at 360 px (temporary preview page, removed).
* **Verified on the real catalog** (no sign-in, straight through the DB function): "mléko" → Lidl 13, Albert/Billa/Kaufland/Penny 1 each; "coca cola", "okurka", "chléb", "máslo" find the expected products; an unknown word finds nothing. Limits seen: the catalog is ~80 products per chain, so coverage is thin (widening it is the third part); names of some chains carry no size, so a "1 l" preference cannot be honoured for them; Lidl stores no pack size at all.
* **Not done yet (parts 2–3):** pinning a specific product to a list item, the N-store planner with priorities and savings, and widening the ingestion.

 Until every branch has GPS, every household member chooses in their own profile ("Moje obchody v okolí") which store chains they have nearby, optionally which specific branches, and how many km they are willing to go for a shop. Before this only a household-wide free-text list existed (`preferences.preferredStores`, unchanged). Decisions (owner-confirmed): **chains and branches**, **per user**, **distance stored and applied later; for now the selection alone filters**.
* **Data (migration `0019`, applied 2026-09-24):** `household_members.max_distance_km` (numeric(4,1), NULL = not set, CHECK 0 < km ≤ 50) and `member_stores` (member, chain, optional branch). A chain-level row has no branch; a branch row also names one. A composite FK (`store_location_id, store_id`) → `store_locations(id, store_id)` makes the database refuse a branch that belongs to another chain (this needed a unique index `store_locations_id_store_id_unique`, which the generated migration created *after* the FK — reordered so it does not fail); partial unique indexes allow one chain row per member+chain and one row per member+branch; rows cascade with the member, the chain and the branch.
* **Rules (pure, `lib/nearby-stores.ts`):** nothing chosen = nothing filtered (hiding all prices of a user who has not configured this would be worse than showing all). A chain that was not chosen is not nearby. A chosen chain with no branch picked counts entirely; with branches picked, a branch-specific price (e.g. from a receipt) counts only for those branches, while the retailer's chain-wide price still counts. A price whose store is unknown is kept. A picked branch implies its chain; distance must be 0 < km ≤ 50 (an invalid value is reported, not silently dropped).
* **Saving (`lib/db/member-store-preferences.ts`, `app/actions/store-preferences.ts`):** the member comes from the session, never from the request; every chain/branch id is checked against the database (unknown → rejected, existing selection untouched); the change is applied as a difference — inserts before deletes — so the selection is never momentarily empty (which would mean "no filtering") and a failure part-way leaves a superset of the old one; concurrent identical saves are harmless.
* **Where it applies:** `AppShell` filters `productPrices` with the user's selection before it reaches the price watch (deals), the shopping list's per-item price comparison and the store-totals comparison. The store directory ("Obchody") is deliberately unfiltered.
* **Not applied yet (known):** the deal notification created server-side when an item is added (`addShoppingItemAction`) still compares all stores — it is a household-level notification computed without a per-user context; the distance itself is stored but not yet used; the household-wide `preferredStores` text list and meal-plan store choice are unchanged.
* **UI:** `components/household/nearby-stores.tsx` in the Profil tab — chain chips, a collapsible branch list per chosen chain, distance field with quick values, explicit save with saving/saved/error states, empty state ("Zatím nemáte vybrané žádné obchody, takže se zobrazují ceny ze všech"). Verified in a real browser at 360 px (temporary preview page, removed): no horizontal overflow, long addresses wrap, selecting/deselecting chains and branches, save, server error and client-side validation all behave.

 Found while checking the first real ingestion: `resolveOrCreateProductFromExternal()` attached a not-yet-linked SKU to any catalog product of the same name, and `products.name` is unique — so several SKUs of ONE retailer that share a name were linked to ONE product. Eight products were affected (12 extra SKUs): Penny's flavours of "Raw tyčinka Crip Crop" (4 SKUs), "Tyčinka Corny Big" (3), "Pribináček" (2), and Lidl's "Olivový olej extra panenský" (3), "Kuřecí prsní řízky", "Rýže v varných sáčcích", "Čerstvé mléko 1,5%", "Čerstvé mléko 3,5%" (2 each). Consequences: their prices were mixed under one product, and each SKU's promotion overwrote the previous one's (35 Penny offers produced only 29 deals). This contradicts CLAUDE.md section 12 (a name is not an identity).
* **Fix.** `lib/products.ts`'s `resolveProductForSku()`: a name match is still how a household's own product, or another retailer's product of the same name, gets this SKU's price attached (Billa's and Penny's "Okurka salátová" remain one product) — but a product already linked to a *different SKU of the same source* is never reused. The SKU then gets its own product named "<name> (<SKU>)" (`distinctProductName()`), deterministic so a repeat run finds it again. Regression tests fail without the fix (same product id) and pass with it.
* **Repair of existing data (applied to the shared database, 2026-09-24).** `lib/db/split-collapsed-products.ts` (`pnpm db:split-collapsed-products`, dry-run by default, `--apply` to write): per collapsed product the smallest SKU stays, every other SKU gets its own product (same category, unit and pantry location) and its official price observations move with it. Nothing deleted. Result: +12 products (355 → 367), external refs (267) and official price rows (243) unchanged in number, a re-run finds nothing. Deals were not moved (a deal belongs to a product, so which SKU an old one described is unknowable); 3 active Penny deals still sit on the original products and are re-upserted per SKU by the next ingestion run.
* **Limits.** A collision name like "Raw tyčinka Crip Crop (88-301743)" is unlovely; a nicer one needs the flavour or pack size, which the connectors do not extract yet (a per-connector "variant" label is the natural follow-up). Household-typed names still match the plain-named product only.

 Requirement: the current price follows the latest date, and older prices stay documented as old prices with their dates. State found before the change: `prices` was already append-only with the latest observation as the current price and a dated `priceHistory`, but ingestion stamped every observation with the app's fixed demo date (`TODAY` = 2026-09-19 — Billa/Penny/DM were observed on 24 Sep and Lidl on 23 Sep, yet all are dated 19 Sep), so every run had the same "date", the current price could not be told from an old one, and `isHistoricLow()` (which looks at observations *before* the current date) could never find one; and a repeat run the same day added an identical duplicate row. Now:
* **Real date.** `lib/ingestion/today.ts`'s `ingestionDate()` — the calendar date in Europe/Prague — is what ingestion stamps (and what the connectors' validity checks use); the fixed `TODAY` remains the app-wide demo clock for everything else.
* **One observation per SKU and day, latest wins.** `recordOfficialPrice()` (`lib/db/queries.ts`), driven by the pure rules in `lib/ingestion/official-price.ts`: identical repeat the same day → nothing written; different values the same day → that day's row is refreshed; older than what is stored → ignored; otherwise a new row. The latest observation per SKU is loaded once per run (`loadLatestOfficialPrices()`), so this adds no query per product. The migration `0018` adds a partial unique index (`prices_official_daily_unique`) so the database enforces it; a racing writer that hits the index falls back to refreshing the existing row.
* **Old prices with dates.** When the price changes, the previous observation is kept and closed: `valid_until` = the date the new price was first observed (the change happened on or before it). `getProductPrices()` now returns `validUntil` on each `priceHistory` entry, and `lib/prices.ts`'s `previousPrice()` gives "the price before the last change, seen on DATE, ended DATE". Repeated observations of an unchanged price are not treated as price changes.
* **Reporting.** The cron response counts `unchanged` (same-day identical) and `priceChanges` (an old price was closed) besides `recorded`.
* **UI:** the shopping list's "Porovnání cen mezi obchody" (`components/shopping/price-comparison.tsx`) now shows, under a store whose price changed, "Dříve 50,00 Kč · zaznamenáno 20. 9., změna 24. 9." (via `previousPrice()` and the new `shortDate()` in `lib/format.ts`); nothing is shown for a price that never changed or has a single observation. Checked in a real browser at 360 px and 1024 px: no horizontal overflow, the text wraps inside the row. The deal cards on Domů (`PriceWatch`) are unchanged.
* **Migration `0018`** was applied to the shared database on 2026-09-24 (index verified; the DB-backed tests, including the unique-index/race test, pass against it).
* **Not done:** the 243 existing official rows keep their wrong 2026-09-19 date (correcting them is a one-off data fix that needs an explicit decision); `deals` used the app's demo clock for "active" until the real-date change below (2026-09-25); a same-day price that changes twice keeps only the last value.

 The first real run of Billa + Penny + DM against the shared database took ~190 s for three stores (~270 s with Lidl) against a 300 s function limit, with no `maxDuration` set. Measured cause (a benchmark with 40 synthetic products, deleted afterwards): about one network round trip to Neon per database query, ~10 queries per new product — including a join over the whole product catalog *per product* and the same external-ref lookup twice. Fixes, in layers:
* **Fewer queries.** `loadExternalProductContext()` (`lib/db/queries.ts`) loads the source's external refs, the catalog and the category ids once per run; `resolveOrCreateProductFromExternal()` takes it as an optional argument and keeps it up to date as products are created; `lastSeenAt` is refreshed by one `touchExternalRefs()` statement per run instead of one update per product. Benchmark from a slow link (one round trip ≈ 400 ms): 40 new products 39.1 s → 14.9 s, 40 existing products 19.4 s → 5.5 s. A run of 80 new products now needs roughly 30 s from that link, less from Vercel, which is far closer to Neon.
* **A time budget the run keeps.** `ingestPrices()` takes a `deadline`: once passed it starts no further product, still does its closing bookkeeping and returns `truncated: true`. Connectors get the same deadline and stop issuing requests (Lidl batches, Billa categories, Penny pages, DM lookups). `runPriceSources()` shares one budget across sources, reports a source that would start too late as `skipped`, and isolates failures. The budget is 230 s of the 300 s limit (`lib/ingestion/cron-handler.ts`), leaving room for the one request or write in flight, the bookkeeping and the response; the route files declare `maxDuration = 300`.
* **Every outgoing request has a 20 s timeout** (`lib/ingestion/http.ts`), so a source that accepts a connection and stalls cannot consume the budget; DM also stops after 5 consecutive failed lookups instead of waiting out a timeout on each remaining product.
* **One cron per store**, each with the whole limit: `vercel.json` now schedules `/api/cron/ingest-prices/lidl|billa|penny|dm` (05:00, 05:10, 05:20, 05:30) — a dynamic route path, the form Vercel's cron documentation describes (query strings in `path` are not documented). `/api/cron/ingest-prices` without a source still runs all stores inside one budget, for manual runs; an unknown source is a 400. Hobby plans start crons at any point within the scheduled hour, so on Hobby the 10-minute stagger is not guaranteed — harmless, since each store now has its own invocation.
* **Not changed / known:** `prices` is append-only, so a duplicate cron delivery (Vercel documents that it can happen) adds a second identical observation for the day; the cron routes accept unauthenticated requests when `CRON_SECRET` is unset (it is set in production; unset locally, which is how a local test request ran a real Billa ingestion and had to be cleaned up — 77 identical duplicate rows removed after verification).

**Update 2026-09-24, fourth connector built: dm drogerie markt CZ (the first non-grocery source).** `lib/ingestion/dm.ts` uses the two `products.dm.de` endpoints dm.cz's own pages call — batch `/product/products/tiles/CZ/dans/<ids>` (50 per request; name, brand, GTIN, price, unit-price text) and `/product/products/detail/CZ/dan/<id>` (category breadcrumbs). Re-checked 2026-09-24: dm.cz's `robots.txt` disallows only transactional paths (`/cart`, `/search`, `/shopping-list`, gift-card flows) and declares the product sitemap; `products.dm.de` publishes no `robots.txt` (404); no login, token or CAPTCHA. Decisions and findings:
* **Sampling:** the sitemap lists 13,041 products. The sample (widened 2026-09-24 from 80 to ~650 products) takes ids with `dan % 20 === 0` (20 divides the earlier 160, so the products sampled before are all still included) — a spread over every aisle that stays the *same products* day to day even as the sitemap changes (a positional "first N"/"every k-th" would drift), so price histories stay continuous.
* **Category:** the tile carries only leaf categories, so the top level comes from one small detail request per product (~650 requests, five at a time, ~6 s total in a dry run from a Czech connection). Mapping: Líčení / Pleť, tělo & parfémy / Vlasová kosmetika / Péče o zdraví → `Drogerie`, Péče o dítě → `Děti`, Domácnost → `Domácnost`, Výživa → `Potraviny`; an unknown top level is rejected, not guessed. Unlike the grocery connectors, DM is not gated to food. A single failed lookup drops that product (logged); if half or more fail the fetch throws so a broken source is visible.
* **Name:** tile headlines carry no brand and `products.name` is unique, so the catalog name is "<brand> <headline>" (unless the headline already starts with the brand) — otherwise two brands' identical headlines would collide into one product.
* **Prices/units:** the numeric `trackingData.price` is cross-checked against the displayed text (`"1 399,00 Kč"`, thousands separators handled); the unit-price text ("400 g (32,25 Kč za 100 g)") is converted to Kč/kg|l|ks via the shared `product-discovery.ts` helpers and validated against price ÷ package size. Units the app doesn't model (e.g. "PD", a wash dose) or no unit-price text fall back to one package = "1 ks" at the package price, never an invented package size.
* **Discounts:** a tile with an original price above the current one ("Výprodej") records the original as the regular price and is flagged `promotionWithoutValidity` (no dates published; same handling as Billa). Caveat recorded in code: this is a clearance, so the "regular" price may no longer be the everyday one — the promotion model has to settle that for Billa and DM together. 1 of 80 in the dry run.
* **Live dry run (no DB writes), 80 products in 3.3 s:** 80/80 normalized — 56 Drogerie, 11 Děti, 9 Domácnost, 4 Potraviny.
* **Not done:** the GTIN (barcode) is kept on the raw record but not persisted — `products` has no barcode column yet (CLAUDE.md section 12 wants one); adding it is a separate schema decision. The receipt chain aliases in `lib/receipts.ts` were not extended with "dm" (a two-letter substring alias would match unrelated text and change receipt behaviour). No physical dm branches are seeded, so nothing appears in the store directory and dm has no deals.
* **DB:** migration `0017` adds the `dm` enum value and inserts the `dm` row into `stores` (the ingestion attributes prices to a chain row; the row alone shows nothing in the UI). Applied to the shared database on 2026-09-24 together with `0015`/`0016` (verified: `product_source` = lidl/billa/penny/dm, `stores` has the `dm` row).

**Update 2026-09-23, Kaufland re-confirmed blocked with a real browser, worse than first thought.** The initial check (a plain `curl` request) got a Cloudflare *"Vyžadováno ověření"* (verification required) challenge page. Re-checked with an actual headless Chromium session (the same tool used for every other source in this research) rather than trusting that curl result alone — both `robots.txt` and the homepage came back as a flat **HTTP 403 "Přístup blokován"** (access blocked), not even a solvable JS challenge. This is Cloudflare's WAF outright rejecting the request, a firmer block than the earlier finding suggested. No workaround was attempted, per `CLAUDE.md` section 15's explicit rule against bypassing CAPTCHA/access controls/technical restrictions — Kaufland stays off-limits unless a different, explicitly-permitted access path (e.g. an official API/feed) turns up later.

**Update 2026-09-23, Penny explored — real data, but organized differently from Lidl/Billa.** `penny.cz`'s `robots.txt` is fully open (just a `Sitemap:` line). Its sitemap contains **no individual product URLs at all** — only ~39 category listing pages (`/category/mlecne-vyrobky-34`, `/category/pivo-51`, etc.); the handful of sitemap entries containing the word "produkt" turned out to be blog/news articles, not product pages. Confirmed Penny runs the *same* Nuxt.js build as Billa (identical build hash observed in both), so it very likely shares Billa's `__NUXT_DATA__` embedding mechanism — confirmed present (158 KB payload) on a category page, with real `price`/`lowestPrice` fields and a `pricesLoyaltyPriceText` field suggesting a Lidl-style loyalty-card price tier. Real prices were visible on the rendered page ("12,90 Kč", "18,43 Kč", etc.). Open question for a future connector: whether a category page's payload contains that category's *entire* product list, or just a first batch with pagination happening some other way not yet observed (no further XHR fired during this session's page load) — needs deeper checking before writing real ingestion code for Penny.

**Update 2026-09-23, DM drogerie explored (owner-initiated, a new source outside the original 6 grocery chains) — the cleanest, richest source found in this entire research pass.** `dm.cz`'s `robots.txt` is open except for transactional pages (`/cart`, `/shopping-list`, `/search`, gift-card flows) and declares a dedicated `product-sitemap.xml` listing **13,047 real products** (`dm.cz/p/d/<id>/<slug>`). Its actual data lives on a separate domain, `products.dm.de` (no `robots.txt` present there — 404, so no declared restriction), which serves a clean, professional REST API **reachable with a plain unauthenticated `curl` request, no cookies/session needed**:
```
GET https://products.dm.de/product/products/detail/CZ/dan/<id>
GET https://products.dm.de/product/products/tiles/CZ/dans/<id1>,<id2>,...   (batch, like Lidl's gridboxes)
```
Response includes `dan` (stable id), a real `gtin` (EAN barcode — the "barcode where available" field `CLAUDE.md` section 12 asks for, which no other source checked so far provides), `brand.name`, `breadcrumbs` (category path), and `price.current.value` (e.g. `"65,50 Kč"`) plus `price.infos` with an already-normalized unit price string (e.g. `"50 ml (13,10 Kč za 10 ml)"`). The product page's HTML also carries a *fully populated* standard schema.org `Product`/`Offer` JSON-LD block (unlike Billa's, which was present but empty at the time it was checked) with `sku`, `gtin`, `category`, `offers.price`/`priceCurrency` — a second, equally clean extraction path. No CAPTCHA, no auth, no JS-heavy state to deserialize. DM is a drugstore, not a grocer, so a connector here would feed the `'Drogerie'` category rather than `'Potraviny'`. Research only, not yet built.

**Update 2026-09-23, Tesco (itesco.cz) checked — blocked, same pattern as Kaufland but a different vendor.** A plain `curl` to `robots.txt` returned "Access Denied" from `errors.edgesuite.net` — Akamai's edge/CDN bot-management error page (Kaufland's blocker was Cloudflare; this is Akamai, a different vendor, same category of outcome). Re-checked with a real headless Chromium session rather than trusting curl alone, same as Kaufland's re-check: both `robots.txt` and the homepage itself came back as a flat **HTTP 403 "Access Denied"**. No bypass attempted, per `CLAUDE.md` section 15. Tesco stays off-limits unless a different, explicitly-permitted access path turns up.

**Update 2026-09-23, Teta drogerie explored — as clean as DM, with one restriction to respect.** Not one of the original 6 chains — a second drugstore chain, checked at the owner's request (`tetadrogerie.cz`; its e-shop is confirmed to sell "at the same prices as physical stores," per a CzechCrunch article found while locating the domain). `robots.txt` explicitly disallows `/price` and `/api/` for every crawler (a clearer, more specific restriction than any other source checked) but allows the actual product pages (`/eshop/katalog/<slug>`) — its sitemap lists **36,834 products**, the largest catalog found in this whole research pass. Verified with a **plain unauthenticated `curl`** (no JS/browser needed at all) that a product page's server-rendered HTML already contains a complete, standard schema.org `Product`/`Offer` block — `sku`, `brand.name`, `category`, `offers.price`/`priceCurrency`/`availability`/`priceValidUntil` — and separately confirmed via a real browser network capture that the only actual `/api/`-prefixed call on that page (`/api/v2/shop/redirects`) is unrelated to price (URL-redirect mapping only). A real connector for Teta would only ever need to fetch the allowed `/eshop/katalog/...` page itself and read its embedded JSON-LD — never the disallowed `/price` or `/api/` paths. Research only, not yet built.

**Update 2026-09-23, Rossmann drogerie explored — real, open source with a different (but equally standard) data format.** A third drugstore chain, outside the original list. `rossmann.cz`'s `robots.txt` only disallows `*filter=*` query strings — otherwise fully open, with a dedicated product sitemap listing **17,779 products** at root-level URLs (`rossmann.cz/<slug>`, no path prefix). Unlike DM/Teta, a product page carries no schema.org `Product`/`Offer` JSON-LD (only generic `Organization`/`BreadcrumbList` blocks) — but the price and product identity are still directly present in the plain, unauthenticated `curl`-fetched HTML via a standard Google Analytics 4 Enhanced Ecommerce `dataLayer.push()` call: `item_id`, `item_name`, `item_brand`, `item_variant` (e.g. "1 ks"), `item_category`/`item_category2`, `price` (excl. VAT), `priceVAT` (incl. VAT), `availability`, `currency` — plus a plain visible price `<div>` in the DOM as a fallback. No GTIN/barcode found on the one page checked. No CAPTCHA, no auth needed. Research only, not yet built.

**Update 2026-09-23, Rohlík.cz explored — likely the strongest grocery source of this entire research pass.** A pure online grocery delivery service, not a store chain with an informational website — checked at the owner's request. `robots.txt` is unusually welcoming: the general group disallows only `/regal/*`, and it carries explicit `Allow: /` entries for `ClaudeBot` and `anthropic-ai` by name, among other AI crawlers. Its dedicated product sitemap lists **19,973 real products** (`rohlik.cz/<id>-<slug>`, stable numeric id). A plain unauthenticated `curl` on a product page returns a complete schema.org `Product`/`Offer` block (`sku`, full category breadcrumb, `price`, `priceCurrency`, `availability`, `seller`) *and* an embedded JS state carrying real package size/unit (`textualAmount`: e.g. "500 g", `unit`: "kg") plus an already-computed normalized unit price (`unitPrice`: e.g. 139.8 Kč/kg) and a distinct `salePrice` field alongside `originalPrice` — meaning active promotions are already structured data here too, without needing flyer OCR the way Albert/JIP would. Because Rohlík's whole business *is* the online price (no separate "in-store vs. website" ambiguity like Lidl/Billa/Penny), this may be the single most direct, reliable, and complete price source found in this whole pass. No CAPTCHA, no auth. Research only, not yet built.

**Update 2026-09-23, Košík.cz explored — another strong pure online-grocery source.** A second online-only grocery delivery service, outside the original list. `robots.txt` only disallows basket/shopping-list pages and a couple of filter/category-parameter patterns — `/api/` is not restricted. Two product sitemaps together list **33,960 real products** (`kosik.cz/p<id>-<slug>`), the second-largest catalog found this session. Unlike Rohlík, a plain `curl` returns almost nothing — Košík.cz is a client-rendered SPA (React) with a ~13 KB HTML shell and no JSON-LD — so a real browser (or at least replicating its fetch) is needed to see the actual call it makes: `GET /api/front/product/slug/<slug>`, a clean, self-descriptive JSON API. Its response is exceptionally complete: `id`, `name`, `brand.name`, `price`, `unit`, real package size (`productQuantity: {value, unit}`, e.g. 180 ml), an already-computed normalized unit price (`pricePerUnit: {price, unit}`, e.g. 160.56 Kč/l), promotion fields (`isSale`, `percentageDiscount`), category, and even `countryCode` (country of origin) and supplier address. No CAPTCHA. Research only, not yet built.

**Update 2026-09-23, Makro checked — blocked, same category of outcome as Kaufland/Tesco.** `makro.cz` returned a flat **HTTP 403** with a custom "ARE YOU LOST? Sorry, only our team of experts has access here." page for both `robots.txt` and the homepage, confirmed with both a plain `curl` and a real headless-browser check (same discipline as Kaufland/Tesco). No bypass attempted, per `CLAUDE.md` section 15. Stays off-limits — and being primarily a wholesale/Cash & Carry chain (like JIP), its pricing wouldn't represent household retail prices even if it weren't blocked.

**Update 2026-09-23, JIP checked — the last of the original 6 chains, no viable consumer price source.** JIP's real domain (`jip-potraviny.cz`, found via web search since it wasn't already known) turned out to be a small, primarily B2B wholesale/gastronomy supplier ("Dodavatel pro gastronomii a širokou veřejnost") — 11 Cash & Carry wholesale locations plus a smaller retail footprint (matches the "small, ~3-location" note from the 2026-09-21 store-directory research, which undercounted it since OpenStreetMap coverage of small chains is sparse). No `robots.txt` exists on the main WordPress marketing site (so no declared restriction), but it has no product catalog either — its "AKCE" (deals) page only links to three separate regional flyer sets (Svět potravin/JIP potraviny/Maloobchod store groups), the same image-based flyer pattern as Albert, not structured data. The site's nav does link to a real e-shop, `jip-eshop.cz` — but its `robots.txt` is an unambiguous `Disallow: /` (the entire site, for every crawler), an explicit stop per this section's own rule, no exploration attempted beyond confirming that one file. It's also explicitly labeled "B2B - E-shop" or its own login page — wholesale gastronomy pricing anyway, not representative of what a household would pay in one of JIP's retail stores, even if it weren't blocked. **JIP therefore has no viable structured consumer price source**, closing out research on all 6 chains named in `CLAUDE.md` section 14 (only Lidl has a working connector; Billa and Penny are viable but not yet built; Albert, Kaufland, and JIP are all confirmed dead ends).

**Update 2026-09-23, Globus explored (owner-initiated, a hypermarket chain outside the original 6) — viable and data-rich, with two real caveats a connector must handle.** Checked with the same discipline as every other source: `robots.txt` first, then plain `curl`, then a real headless-Chromium session (no CAPTCHA or bot challenge encountered; `www.globus.cz` returns HTTP 200 normally).
* **`robots.txt` — read carefully, because it is not a blanket allow.** It's `Allow: /` with a long list of `Disallow` patterns (one triple per hypermarket) targeting product-detail pages (`/<store>/hypermarket/*/p/`) and offer listings, plus `/o-nas/dokumenty-pro-dodavatele/`. It declares one `Sitemap:` (`/sitemap.xml` → one sub-sitemap, 37,851 URLs, of which **35,053 are product pages** shaped `/globus/hypermarket/cela-nabidka/p/<slug>-<vanr>`). Tested every sitemap URL against every `Disallow` rule using standard wildcard semantics: **0 are blocked** — the generic-catalog rule is written `/globus/hypermarket/cela-nabidka/*/p/` (needs an extra path segment before `/p/`), so it doesn't match the real URLs the site's own sitemap advertises. That is a literal-reading result; the per-branch variants (`/brno/hypermarket/cela-nabidka/p/...` and the other 16 branch slugs) **are** matched by their own rules (`/<branch>/hypermarket/*/p/`), so **a connector must only ever use the generic `/globus/...` catalog paths and never a branch-specific path.** The intent behind the asymmetry isn't documented anywhere, so this is worth re-confirming (or asking Globus) before any large-scale crawl.
* **Data source: Nuxt `__NUXT_DATA__`, no JSON-LD.** Same Nuxt platform family as Billa/Penny — a plain unauthenticated `curl` returns the full product record in the page's serialized `__NUXT_DATA__` payload (devalue format; `devalue` is not in this repo's dependencies, so a connector would either add it deliberately or hand-write a small, tested resolver), under `data['product-<vanr>']`. There is **no** schema.org `Product`/`Offer` block on these pages (0 `application/ld+json` scripts). Useful fields: `vanr` (stable Globus article number, also the URL suffix), `ean` (array — real GTIN/EAN barcodes, present on **20/20** sampled products, sometimes two per product), `name`, `brand.name`, `unitId` + `unitAmount` (e.g. `g` × 33), `sellUnitSizeText` (e.g. "33 g"), `calculatedPrice.currentPrice`, `calculatedPrice.normalPrice`, `ribbon.vSale.label` (e.g. "-37 %"), `productCategories` (Globus's own `cls_czr_*` ids), `countriesOfOrigin`, `modified` timestamp, plus allergens/nutrition. Browser-verified: the rendered price matches the payload (11,90 Kč; the page's own "36,06 Kč/100 g" equals 11.9 / 33 × 100).
* **Promotions are structured data:** in a 20-product sample spread across the sitemap, 5 had `normalPrice > 0` (the pre-discount price) with a matching `ribbon.vSale` percentage — no flyer OCR needed for these. No explicit promotion validity dates were found in the payload (unlike Lidl's `price.discount` validity fields), so a connector can record the observed discount but not its end date. A "Nižší cena pro členy Můj Globus" (loyalty-tier price) note is shown on pages but the member price itself isn't in the anonymous payload.
* **Caveat 1 — prices are per-branch ("house"), not national.** The page says "Informace pro Praha-Čakovice" and "Zobrazená cena produktu je platná na prodejně k <timestamp>"; the payload state holds `productDetailsByVanrAndHouse`, and category pages call `/api/v1/gsoa/productCatalog/4005/...` (`4005` is very likely the branch/"house" id — an inference, not verified). An unauthenticated request lands on a default branch (Praha-Čakovice in every request seen here). Whether prices actually differ between branches was **not** verified, because the only way to see another branch's page is via the branch-specific URLs `robots.txt` disallows. A connector should therefore record Globus prices against the default/Praha-Čakovice location, not present them as chain-wide.
* **Caveat 2 — the payload's own fields can be internally inconsistent, exactly the case `CLAUDE.md` section 33 says to flag rather than trust.** In the 20-product sample: an Alnatura broccoli has `unitAmount` 400 but `sellUnitSizeText` "300g" (and "300g" in its name); a Jar capsule product has `unitAmount` 60 but "61ks" in its name; product names can carry a literal `&nbsp;` HTML entity; and some non-food items have `sellUnitSizeText: null` with `unit KS × 1`. A connector must cross-check `unitAmount` against `sellUnitSizeText`/name and reject or flag mismatches, and decode entities in names.
* **Cost caveat:** each product page is ~1.5 MB (the whole Nuxt state is inlined), so a full 35k-product pass would be tens of GB per run. Category listing pages (`/globus/hypermarket/cela-nabidka/<category>`, not disallowed) render ~19 products' prices directly in the HTML with no separate product-list XHR observed, so no lighter product API was found in this pass. A Lidl-style small pilot (tens to a few hundred products, chosen from the sitemap) is the realistic first step, not a full crawl.
* Research only, not yet built. Scratch scripts used: `scratch-explore-globus.ts`, `scratch-explore-globus2.ts` (untracked, throwaway, same as the `scratch-explore-wolt*.ts` files).

**Update 2026-09-23, Foodora Market (foodora.cz) explored — good data, but an active bot challenge stops it; treated as blocked.** Checked at the owner's request (this is also where Albert's discontinued e-shop redirects customers, so it was a possible route to Albert).
* **What exists.** `robots.txt` has no blanket restriction on catalog pages (it disallows only transactional/internal paths such as `/login`, `*/checkout/`, `*/xhr/api/v2/collector`, `*/view-all/*`, and disallows `GPTBot` outright). The sitemap index lists: **10 `darkstore` pages — "foodora Market" is only 10 Prague-area dark stores** (Chodovská, Bohunická, Herspická, Dělnická, …), **6,184 grocery product pages** (`/groceries/product/<sku>/<slug>`), and **1,202 `shop` pages**, which include partner-store listings: ~46 Albert, ~62 Billa, ~62 Penny, ~109 Tesco, ~21 Globus (none for Lidl/Kaufland/JIP/DM/Rossmann/Teta).
* **What a product page carries** (seen in one plain-`curl` response, `window.__PRELOADED_STATE__`, JS-object not strict JSON): `sku`, `name`, `price`, `originalPrice`, `attributes.pricePerBaseUnit` (already-normalized, e.g. 151.21 Kč/l), `attributes.minPriceLastMonth`, `stockAmount`, `vendorId` (the dark store the price applies to), a real barcode in `foodLabelling.productInfos` ("Barcode information"), `discount` campaign badges. No schema.org JSON-LD.
* **Why it's a stop, not a green light.** Every request through a real headless-Chromium session — both an Albert shop page and a Foodora Market product page — returned **HTTP 403 with a PerimeterX "Please confirm you are a human (and not a bot)" challenge** (`px-cloud.net`). A plain `curl` of the same URLs returned HTTP 200, so enforcement is inconsistent, but an active human-verification challenge is an unambiguous signal that automated access isn't wanted, and `CLAUDE.md` section 15 forbids bypassing CAPTCHA/technical restrictions. No bypass was attempted, and nothing beyond the initial discovery requests (robots.txt, sitemaps, one product page, one shop page via `curl`, plus the two challenged browser loads) was fetched. **Do not build a Foodora connector on scraping**; it would need an official partner/API/data-feed route.
* **Albert via Foodora is also a dead end here:** the Albert shop page's server-rendered state holds only vendor info (address, chain, delivery time; 0 product/price objects) — the menu is loaded client-side afterwards, which requires exactly the browser session PerimeterX challenges.
* **Independent data-quality caveat, even if access were granted:** Foodora Market and partner-store listings are *delivery-platform* prices, which are commonly not equal to shelf prices in the physical store. Not measured here (no in-store comparison was made), but a connector would have to store these under a distinct source/context, never as the chain's in-store price.
* Scratch script: `scratch-explore-foodora.ts` (untracked, throwaway).

**Update 2026-09-23, Wolt (Wolt Market + partner stores) explored — viable, the first source found that covers Albert and Kaufland at all; but delivery-platform prices are not reliably in-store prices.** Checked at the owner's request; this is the other place Albert's discontinued e-shop redirects to (an earlier exploration session had left `scratch-explore-wolt*.ts` and captured requests behind without recording a result — this pass redid it properly and is the first written record).
* **Access.** `wolt.com/robots.txt` is fully open (`Disallow:` empty, one `Sitemap:`); `explore.wolt.com` likewise; the API hosts (`consumer-api.wolt.com`, `restaurant-api.wolt.com`) have no `robots.txt` (404, no declared restriction). A real headless-Chromium load of a Wolt Market venue page returned HTTP 200 with **no bot/human-verification challenge** (unlike Foodora); an hCaptcha asset is loaded on the page, but only in the background for login/registration flows, and nothing blocked page viewing. Wolt's Terms of Service were **not** reviewed in this pass.
* **What's listed.** Sitemap index has Czech sub-sitemaps for `venues` (25,398 URL rows, which is 3 language variants each), `items` (`items/cze-1.xml` + `items/cze-2.xml`, **exactly 10,000 item URLs each — looks capped, not the full catalog**: one Wolt Market venue alone shows 1,348 listed items), categories, cities and brands. **"Wolt Market" is 11 venues** (Prague ×3, Brno, Plzeň, Ostrava, Liberec, Karlovy Vary, Hradec Králové, České Budějovice, Ústí nad Labem). The 20,000 listed item URLs span 523 venues by chain: **Albert 6,891, Wolt Market 4,558, Billa 3,265, Kaufland 1,347, Tesco 1,148, Globus 1,127, Penny 698**, plus small independents and pharmacies (Teta 77). No Lidl.
* **Data source.** No separate product API call: a plain unauthenticated `curl` of a venue (1.7 MB) or item page returns the item records inside the page's `<script type="application/json" class="query-state">` (react-query dehydrated state, valid JSON — easier than Nuxt's devalue). Fields per item: `id`, `name`, **`barcode_gtin`** (44/44 on one Wolt Market Brno page), **`price` in minor units (3990 = 39,90 Kč)**, `original_price`, `lowest_price` (lowest price in the recent period, an EU-style price-history field), `unit_info` ("2 l"), a **pre-computed `unit_price`** `{price, base, unit: litre|kilogram}`, `vat_percentage`, `purchasable_balance` (stock), `sell_by_weight_config`, `item_price_discount_validity_period` (present as a field but `null` on every item seen, so no promotion end dates in practice), `alcohol_permille`. Venue-level open status/delivery slots come from `consumer-api.wolt.com/order-xp/web/v1/venue/slug/<slug>/dynamic/`.
* **Verified consistency (one Wolt Market Brno page, 44 items):** the platform's own `unit_price` matched `price ÷ pack size` exactly on every non-weight item (0 mismatches). The 10 apparent mismatches were all `sell_by_weight` items (loose fruit/veg such as "Rajčata, ~120 g") where `price` is **per kg** and `unit_info` is only an approximate portion — a connector must branch on `sell_by_weight_config`, not read `price` as the price of one piece. 9/44 were discounted (`original_price > price`); 8 carried `lowest_price`.
* **The key question — do Wolt partner prices equal in-store prices? Tested, and the answer is "usually, not reliably".** Cross-checked 6 products sold both on `globus.cz` (default branch Praha‑Čakovice) and on Wolt's "Globus Čakovice" venue, fetched minutes apart: **barcodes matched 6/6** (a genuinely useful join key across sources), **prices were identical on 4/6**; one Wolt price was **higher** (Váš Výběr hladká mouka 1 kg: 9,90 Kč on globus.cz vs 12,90 Kč on Wolt); one Globus **promotion was not passed through** (Chodura Fitnes šunka: 25,90 Kč promo on globus.cz vs 34,90 Kč regular on Wolt). n=6 and not simultaneous (Globus itself says its prices can change during the day), so this shows the two sources *can* diverge, not by how much on average. Consequence: Wolt-sourced prices for Albert/Kaufland/Globus/etc. must be stored as **their own source context ("Wolt delivery price at venue X"), never as the chain's in-store shelf price**, and must never overwrite an in-store price from a chain's own site.
* **What this changes:** Albert (and Kaufland, blocked at its own site) now have a structured price source at all — 6,891 and 1,347 listed item URLs respectively — with real barcodes, but only as delivery-platform prices, and only for venues that Wolt serves. Wolt Market itself is Wolt's own dark-store retail, so its prices *are* the price at that venue.
* **Not done / open:** no connector written; Wolt's ToS unreviewed; per-venue price variation across the 11 Wolt Market venues unmeasured; how the items sitemap's 10,000-per-file cap relates to the real catalog unknown; a ~1.7 MB page per venue (only the first ~44 items were in the initial state) means a category-page or per-item fetch strategy would need its own check before any crawl volume is chosen.
* Scratch script: `scratch-explore-wolt5.ts` (untracked, throwaway), alongside the earlier `scratch-explore-wolt*.ts` files.

---

# 16. Currency

Currency support has been partially implemented.

The database includes currency fields for:

* households
* prices
* deals

Default currency:

```text
CZK
```

The current UI still contains some Czech-specific formatting assumptions.

A more complete localization/currency abstraction remains to be implemented before international rollout.

---

# 17. Shopping Lists

Shopping lists are persisted in Neon.

The application supports database-backed shopping-list data.

Shopping-list items can contain product and quantity information.

The long-term shopping-list model should support:

* quantities
* units
* product references
* completion state
* optional store association
* optional prices
* notes

The shopping-list domain should remain deterministic and database-backed.

**Update 2026-09-24 — a receipt import ticks off the list.** When a receipt becomes a purchase (manual entry, automatic OCR, reviewed or duplicate-resolved import — all go through `createPurchaseFromReceiptItems`), the household's open list items are matched against the receipt lines (`lib/receipt-list-match.ts`, pure). A *certain* match (same catalog product, or the same name ignoring case/diacritics/punctuation) is ticked automatically; a *plausible* one (every word of the list item appears in the receipt line, e.g. "Mléko" ↔ "MLEKO POLOTUC. 1L") is offered on the Rozpočet tab (`ReceiptListSuggestions`) and ticked only after confirmation — the server re-derives the proposals and accepts only those, so a client cannot tick an arbitrary item. A ticked item takes the receipt's real quantity, unit and per-unit price paid, and records `shopping_list_items.checked_by_purchase_id`; `completePurchaseAction` skips those items (the receipt already recorded the purchase and restocked the pantry) but still removes them from the list. `shopping_list_items.quantity` is now `numeric(10,3)` (weighed items). Migration `0022_receipt_checks_shopping_list`. Limits: one receipt line per list item (repeated lines of the same product are not summed), and matching is by words, not by fuzzy spelling.

---

# 18. Budget and Expenses

Budget functionality is implemented using Neon persistence.

Current functionality includes:

* budget records
* expense records
* remaining budget calculation
* percentage-used calculation
* budget threshold notifications

Budget threshold behavior currently includes important thresholds such as:

```text
80%
100%
```

Budget calculations are implemented as application logic rather than being dependent exclusively on the UI.

Recent work added notification behavior when spending crosses configured thresholds.

---

# 19. Notifications

Notifications are persisted in the database.

Current notification functionality (2026-09-21) covers all four Phase 8 events. Each is a
deterministic generator wired into the Server Action (or, for reminders, the cron route) for the
triggering event:

* **budget thresholds** — `lib/budget.ts`'s `crossedBudgetThreshold()`, wired into `addExpenseAction`. Fires once when spending crosses 80% or 100% of the household's monthly budget; does not re-fire while already in the same band.
* **important promotions (price/deal alerts)** — `lib/prices.ts`'s `assessDealQuality()`, wired into `addShoppingItemAction`. Fires when a product just added to the list has a currently active deal that is genuinely the best price for it across known stores, not merely any discount.
* **shopping reminders** — the only event that isn't triggered by a user action. `app/api/cron/shopping-reminders`, a daily Vercel Cron job (`vercel.json`), finds undone list items that have sat around at least `STALE_AFTER_DAYS` (3) using the pure `lib/reminders.ts`'s `findStaleItems()`, and reminds the household once per stale item. Fully live in production since 2026-09-21 — see section 27 "Cron authorization".
* **household events** — `lib/db/queries.ts`'s exported `joinHouseholdViaInvitation()` notifies the household when someone joins via invitation. Shared by both places a join can happen (auto-join on first login, and the explicit `acceptInvitationAction` from `/invite/[token]`) — those two paths had duplicated the join mechanics before this, now consolidated into one function.

Notifications should use deterministic rules wherever possible.

AI should not be introduced simply to perform deterministic notification logic.

---

# 20. Meal Plans

Meal-plan functionality is partially implemented.

The existing recipe catalog remains code-based by design.

Generated weekly meal plans are persisted in:

```text
meal_plans
```

Meal planning is intended to integrate with:

* household members
* preferences
* children
* exclusions
* shopping lists
* budget
* products

The meal-plan domain should not be duplicated by creating another independent recipe/meal system.

**Update 2026-09-22:** Generation is now optionally stock-aware (uses the household pantry to favor recipes it can partly make from what's already at home), individual meals can be regenerated one at a time, and a meal can be marked cooked to deduct its ingredients from the pantry. See section 33.

**Update 2026-09-23, real per-ingredient quantities:** The recipe catalog's `Ingredient` type gained `quantity`/`unit` fields, authored as real content for all 14 recipes and the 3 staples (e.g. "0.25 l Mléko polotučné", "2 ks Vejce", "0.15 kg Kuřecí prsa") — the same kind of author-generated content the catalog's `price`/`allergens` fields already were, not external data. This closes the "Meal-plan ingredient quantities" gap in section 27: `matchIngredientToStock()` now checks whether the pantry genuinely has *enough* of an ingredient (via a new `convertQuantity()` helper that converts between compatible units — kg↔g, l↔ml — and returns `null`, rather than guessing, for incompatible ones like kg vs ks), instead of just "is there any row at all"; `markMealCookedAction` (`app/actions/meal-plan.ts`) now deducts the recipe's real quantity from the matching pantry row (converted to whatever unit that row happens to track), instead of a flat 1 regardless of the recipe; `planIngredients()` now sums quantities across every day/recipe that uses the same ingredient, instead of keeping only one occurrence's amount; and "Přidat chybějící do nákupního seznamu" (`components/app-shell.tsx`'s `addIngredients()`) now shows the real quantity/unit in the added item's detail text (e.g. "0.2 kg · z jídelníčku") and passes the real unit through to `addShoppingItemAction`, instead of always claiming "1 ks". A recipe's own unit is deliberately not forced into the shopping-list item's numeric `quantity` field (still an integer column, and "how many packages to buy" for a fractional consumption amount would need real package-size data — the same still-blocked "Product normalization" gap, not reopened here). Verified in a real browser against the real dev database: signed up a disposable account, generated a plan, and confirmed every added shopping-list item's detail text showed its recipe's actual authored quantity/unit rather than a flat "1 ks" (server logs show e.g. `addShoppingItemAction(..., "Kokosové mléko", {"detail":"0.4 l · z jídelníčku","unit":"l"})`). 10 new/updated tests (`lib/meal-plans.test.ts`: `convertQuantity`, quantity-aware `matchIngredientToStock`, ingredient-summing `planIngredients`; `app/actions/meal-plan.test.ts`: real-quantity deduction, insufficient-stock removal, incompatible-unit skip). 242/242 tests passing; `tsc --noEmit`/`next build` clean.

---

# 21. Purchase History

Purchase-related database structures exist.

The purchase model includes:

* purchases
* purchase items

Purchase history is intended to support future functionality such as:

* spending analysis
* frequently purchased products
* recurring purchases
* price trends
* consumption patterns
* shopping optimization

This area remains less mature than the core shopping-list and budget functionality.

**Update 2026-09-21:** Found this was more than "less mature" — no Server Action ever wrote a real purchase; `purchases`/`purchase_items` were seeded once and read-only ever since (the analytics in `lib/purchase-history.ts` and `components/budget/purchase-history.tsx` were real, just fed frozen data). Added `app/actions/purchases.ts`'s `completePurchaseAction(listId)`, triggered by a new "Dokončit nákup" button next to the shopping list's existing "Vymazat hotové" (the two now coexist: one just discards done items, the other turns them into real purchase history). It groups the list's done items by preferred store (items with none share one purchase with no store — a real case, not an error) and creates one `purchases` row + its `purchase_items` per group, then removes those items from the list. Found and fixed a related bug while wiring this up: `getHouseholdData()` was defaulting a purchase's store to `'Lidl'` whenever `storeLocationId` was null (`purchase.storeLocation?.store.chain ?? 'Lidl'`) — silently inventing data. `PurchaseRecord.store` is now correctly optional, matching the schema's real nullability, and the UI shows "Neurčený obchod" instead. Verified in a real browser against the real dev database: added a real catalog item, marked it done, clicked "Dokončit nákup", confirmed the item left the shopping list and a real purchase appeared in the budget tab's history with the correct date, store fallback text, and "Nejčastěji kupované" analytics update. The item's `price` in the resulting purchase reflects `shoppingListItems.price` (the item's own stored price field, same as `plannedSpend()` already uses for budget planning) — not the live catalog price shown via `productPrices`, which is a separate, pre-existing gap (nothing has ever synced these two) rather than something new. `purchaseItems.productId` is now actually populated too, inherited from the shopping-list item's own `productId` (see section 12).

**Update 2026-09-22:** A second write path now exists alongside `completePurchaseAction`: `app/actions/receipts.ts`'s `importReceiptAction()` turns manually-entered receipt line items into a real purchase (plus pantry restocking), with the OCR-extraction step deliberately stubbed for later. See section 33.

---

# 22. Smart Shopping Engine

A Smart Shopping Engine has been started.

Current logic considers factors such as:

* trip distance
* promotion quality
* budget constraints
* store comparison
* unit price
* historical prices — `lib/prices.ts`'s `isHistoricLow()`, foundation done 2026-09-21 (see section 13); flags a deal as a genuine all-time low rather than just today's discount, but has no real historical data to act on yet since nothing populates price history in production
* stock/storage constraints — done 2026-09-22 via the household pantry (section 33): meal-plan generation can prefer in-stock ingredients and skips already-owned ones when adding to the shopping list. The shopping-list optimization itself (`compareStoreTotals`/`cheapestPossibleTotal`) still doesn't consume pantry state directly — see `docs/04_ROADMAP.md` Phase C for the precise scope of what's done
* bulk-buy recommendations — done 2026-09-22: `lib/prices.ts`'s `suggestsStockingUp()` combines a real "genuinely best price" deal signal with real pantry-quantity data (not invented package/bulk-pricing data, which still doesn't exist) — flags a deal as worth stocking up on only when the household has 1 or fewer in stock. Surfaced in `price-watch.tsx`. This closes out Phase C — every item in `docs/04_ROADMAP.md`'s Smart Shopping Engine phase is now done

The engine is intended to optimize the overall shopping trip rather than simply find the cheapest individual item.

Future improvements should include:

* number of stores visited
* travel cost
* household preferences
* product availability
* required quantities
* purchase patterns

The optimization logic must remain deterministic and testable.

---

# 23. Testing

Automated testing has been started.

Tests currently cover areas including:

* budget
* prices (including historic-low detection)
* meal plans
* geographic/store logic
* shopping reminders (staleness logic)
* every Server Action in `app/actions/` and their household-scoping/role checks, against the real dev database (`app/actions/*.test.ts`)
* invitation/join-via-invitation logic and its notification, against the real dev database (`lib/db/queries.test.ts`)

Further tests are still required for:

* full session/cookie-level authentication (would need e2e testing, not attempted)
* auto-provisioning (new-household-on-first-login path inside `getHouseholdData()`, as opposed to the invitation-join path which is now covered)
* price ingestion
* promotion normalization
* shopping optimization

Critical business logic should receive regression tests when bugs are fixed.

---

# 24. TypeScript / Build

The previous TypeScript build-error bypass has been removed.

The project should compile against the actual TypeScript errors.

Do not introduce configuration that hides genuine TypeScript errors simply to make deployment pass.

Before considering a feature complete, validate the relevant:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

commands that are actually available in the project.

---

# 25. Current Backend Priorities

The current backend development branch is:

```text
v0/backend
```

The recommended order of work is:

### Phase 1 — Backend foundation

* audit current backend
* stabilize data access
* stabilize authorization
* improve database integrity
* improve tests
* improve error handling

### Phase 2 — Core household functionality

* household/profile
* members
* children
* preferences
* shared household

### Phase 3 — Shopping

* shopping lists
* products
* product normalization
* quantities/units

### Phase 4 — Financial data

* budgets
* expenses
* purchase history

### Phase 5 — Prices and promotions

* product normalization
* external data ingestion
* price history
* promotion history
* unit-price comparison
* retailer connectors

### Phase 6 — Meal planning

* meal plans
* shopping-list integration
* budget integration

### Phase 7 — Optimization

* store comparison
* distance
* travel cost
* promotion quality
* household constraints

### Phase 8 — Notifications

* budget alerts
* price/deal alerts
* reminders
* household events

### Phase 9 — Internationalization

* currencies
* localization
* international store architecture
* country-specific data providers

### Phase 10 — AI

AI Shopping Assistant is the final major phase.

---

# 26. AI Status

AI functionality is intentionally deferred.

The project should not currently add:

* Vercel AI SDK
* AI Gateway
* LLM provider integrations
* model API calls
* AI agents
* embeddings

until the underlying application data is sufficiently reliable.

The AI assistant should eventually operate on:

* household data
* preferences
* shopping lists
* products
* prices
* promotions
* budgets
* purchase history
* meal plans
* store information
* optimization results

AI should be an additional intelligence layer on top of a reliable deterministic system.

**Explicit exception (2026-09-22, owner-approved):** receipt OCR import is allowed to use the Vercel AI SDK now — see `CLAUDE.md` section 30 and `docs/08_OCR_RECEIPT_PIPELINE.md` for the full reasoning. Narrow and specific to `lib/receipts.ts`'s structuring step; the conversational "AI Shopping Assistant" itself stays deferred to last.

---

# 27. Current Known Gaps

The following areas remain open or incomplete.

## Product normalization

The real productId link from a shopping-list item to the catalog now exists and is populated (see section 12) — previously dead schema. Done since (2026-09-21): the shopping-list input now has native browser autocomplete (`<datalist>`) against the real catalog (`components/shopping/shopping-list.tsx`), so typed text has a real chance of matching instead of relying on the user to type it exactly. Still free text underneath — nothing is enforced, picking a suggestion is optional. Verified end-to-end in a real headless-browser session against the real dev database: signed up a fresh test account, confirmed the datalist's options matched the live catalog, added an item by picking a differently-cased suggestion, and confirmed both the item appeared correctly in the UI and its `productId` was set to the right product in the database. Still needed, in roughly this order:

* stronger mapping of: brand, variant, package size, unit, barcode, external product identifiers — deliberately not modeled yet; there's no real catalog data with more than one package size per product to design or verify this against
* ~~wiring `purchaseItems.productId`~~ **done, this bullet was stale**: `completePurchaseAction` has populated it since 2026-09-21 (see section 21) — this list just hadn't been updated to reflect that

**Update 2026-09-23, unit-normalization bug fix (see section 12):** while scoping the brand/variant/package-size work above (still blocked on real multi-package-size data, so left alone), found and fixed a live, real bug in the one piece of unit normalization that *doesn't* need that data: a product's own remembered `defaultUnit`. See section 12 for the full fix.

## Price history

The append-only recording mechanism and the domain logic that consumes it both exist (`recordPriceObservation()`, `isHistoricLow()` — see section 13). Still needed: something that actually calls it. No price-refresh/ingestion source is wired up, so no real product has more than one observation yet.

## Promotion history

Need reliable historical tracking of promotions. Unlike prices, `deals` has no append-only observation mechanism yet — only current `valid_from`/`valid_until`.

## External price ingestion

**First connector done 2026-09-23** (see section 15): Lidl CZ, real pilot batch of 80 grocery products, daily cron. **Second connector done 2026-09-24:** Billa CZ, on a shared connector interface. **Third connector done 2026-09-24:** Penny CZ (weekly offers with real validity dates). **Fourth connector done 2026-09-24:** dm CZ (drugstore). **Fifth connector done 2026-09-24:** Rohlík.cz, the first online-only chain (see below). **Sixth connector done 2026-09-24:** Košík.cz (online-only). Still needed: connectors for the remaining viable sources (Teta, Rossmann, Globus); a decision on storing Billa promotions that have no end date; a category-aware discovery for Lidl (its slug-keyword pre-filter caps the batch at ~180 products); flyer-based promotion data (deferred, see section 15).

**Update 2026-09-24, catalog widened (per-source batch sizes).** The one-size pilot batch of 80 is gone: each source has its own daily batch in `PRICE_SOURCES` (`lib/ingestion/ingest.ts`) — Lidl up to 400 (in practice ~180: the keyword pre-filter, widened from 31 to ~110 grocery keywords, is the limit), Billa 450 (`pageSize` 50 per category, paged when a category needs more), Penny 80 (its whole catalog is ~38 offers), dm 700 (~680 kept; sample modulus 160 → 20, category lookups five in parallel). A dry run without DB writes showed Billa 444/444, dm 680/687, Lidl 179/205 and Penny 35/38 products normalized, in 0.3–6 s of fetching. The per-run deadline (230 s of the 300 s function limit), the `truncated` flag and per-store crons are unchanged; the database is in the same region as Vercel's functions, so the ~1,400 writes per run are far faster there than from a development machine. No stored cursor: each run re-reads the same stable sample, so price history per product stays continuous.

**Update 2026-09-24, Rohlík.cz connector and the online-only store model.** `lib/ingestion/rohlik.ts` reads the JSON the site's own category pages call (`/api/v1/categories/normal/<id>/products`, `/api/v1/products?products=…`, `/api/v1/products/prices?products=…`); `robots.txt` disallows only `/regal/*` for the general group, no login, no CAPTCHA (re-checked live). Ten top-level food categories (from `sitemap_base.xml`), up to 500 products a day, cron `/api/cron/ingest-prices/rohlik` at 05:40 UTC. Live dry run without database writes: ~486 products fetched in 11 s, 3 rejected, 73 with an active public promotion. Rules: package price plus source-computed per-kg/l/ks unit price, cross-checked against the stated package size (a 5 % disagreement was found on a real record and is rejected); weighed items are recorded per kg, not by their one-piece estimate; units other than kg/l/ks (a flower bouquet) are refused. **Only public promotions become deals:** `sale`, `longtermAction` and `expiration` with an end date, one piece, not silent/inactive — Rohlík Premium members' prices (`premium`, the majority of the "sales" returned), multipacks and bundles are deliberately not deals; a promotion with no end date is counted, not stored.

**Online-only stores (migration `0023_online_stores_rohlik`).** Rohlík has no branches and none is invented. `stores.is_online` marks such a chain; `deals` gained `store_id` (the chain, backfilled for existing deals) and `store_location_id` became nullable — a composite foreign key still forces a named branch to belong to the deal's chain. An online chain's prices were already chain-wide (CHAIN scope) and its deals now carry the chain and no branch; `getProductPrices()` folds such a deal into the chain's chain-wide price, and product search reads deals by chain. Chains with branches keep attaching deals to their canonical branch as before. The chain picker ("Moje obchody v okolí") lists Rohlík with an "online" label; the shopping planner already worked per chain and needed no change. Not done: delivery fee, minimum order and delivery-area availability are not modelled. A Lidl-style gap remains — a physical chain's chain-wide (no branch) price is not matched to its deal, which is attached to a branch.

**Update 2026-09-24, Košík.cz connector (online-only, on the model from migration 0023).** `lib/ingestion/kosik.ts` reads the JSON the site's own pages call: `/api/front/menu/main` (category tree) and `/api/front/page/products/flexible?slug=<category>&page_display=vertical` (a category's products as a flat list; the default view groups them by sub-category and returns none). The API states its own limit — "limit over 30 products is denied" — so every request asks for 30. A run reads the sub-categories of the eight food top-levels breadth first — the first page of every sub-category, then the second page of each (the site's own "load more" call, `POST /api/front/products/more` with `{cursor, limit}`), and so on — so an early stop still covers every aisle; up to 1,800 products a day, cron `/api/cron/ingest-prices/kosik` at 05:50 UTC. `robots.txt` (re-read today; it changed since the first look) disallows `/l*_c*` listing pages, `/basket` and `/nakupni-listek*`, none of which is touched, and does not disallow `/api/`; no login, no CAPTCHA. Live dry run without database writes, first version (first page only): 900 products in 26 s, 884 usable, 16 rejected, 104 with a dated promotion; with paging, 2,400 products in 70 s (~81 requests), 2,354 usable, 46 rejected, 288 with a dated promotion. Rules: `recommendedPrice` is the regular price while a promotion runs (the printed unit price is for the current price and is scaled back); weighed items (`cca` estimate) are recorded per kg; a stated package size must agree with the unit price. The 16 rejects are canned goods whose unit price is per *drained* weight (EU rule), which the package size does not show — refused rather than guessed. **The promotion end date exists only as text** ("Akce platí do 29. 9."): it is parsed to the first such date not before today (this year, or next around New Year), refused when impossible or more than 120 days away, and "Spotřebujte do …" (best-before clearance) is not a promotion window — a discount without a usable date is counted, not stored. Multi-buy tiers (`cumulativePrices`) are not deals. Migration `0024_product_source_kosik` adds the source and the online chain row.

**Update 2026-09-25, home screen overview.** Domů starts with "Dnes je důležité" (receipts waiting on the household, promotions on list items ending today or tomorrow; `lib/attention.ts`), then a compact budget card, one row of quick actions and the shopping list, so on a phone these and the first deals fit on the first screen. The deals card lists deals for list items first (`dealsForList()`), three at a time. Entry points to the deferred AI assistant are hidden (`lib/features.ts`). On Rozpočet the receipt upload sits under the heading and the expense and purchase lists show the newest five.

**Update 2026-09-25, deal counts per chain.** The store directory shows each branch its chain's promotions running today ("N aktivních akcí v řetězci"), because ingestion stores a chain's web promotions against one canonical branch and a per-branch count left all but one branch at zero. A promotion counts only from its `valid_from` to its `valid_until` in the directory, the price comparison and product search.

**Update 2026-09-25, the app runs on the real date.** The fixed demo date (`TODAY = '2026-09-19'` with `MONTH_START`, `DAYS_IN_MONTH` and a made-up `PREVIOUS_MONTH_TOTAL` in `lib/budget.ts`) is gone. `lib/today.ts` `todayInPrague()` gives the real date in Czech time; server code calls it per request and `app/page.tsx` hands it to the client as `today`. "This month" is the calendar month of that date everywhere the monthly budget is shown or checked (hero, breakdowns, averages, projection, 80 %/100 % notifications); month-over-month compares this month so far with the same days of the previous month and is hidden without previous-month data. Active deals, the meal-plan week and the dates of new expenses, purchases and receipts follow the real date. **Known data issue:** the 9 expenses entered 21.–24. 9. are stored as 19. 9. (the old fixed date) and were not corrected. The time zone is fixed to Europe/Prague until households get their own (internationalization).

**Update 2026-09-25, a promotion's unit price is stored (migration `0025_deal_unit_price`).** `deals` gained nullable `unit` and `unit_price` (Kč per kg / l / ks, the product's normalized unit), with a check that both are set or neither. Before, a deal kept only its package price and the app derived the unit price by scaling the regular one — impossible for an offers-only source such as Penny, whose offers have no regular price. Every connector that stores deals now supplies it (`NormalizedProduct.deal.unitPrice`): Penny and Košík use the offer's own printed unit price, Rohlík the per-kg promotion for weighed goods and otherwise the regular one scaled by the price ratio (`scaleUnitPrice()` in `lib/ingestion/product-discovery.ts`), Lidl the printed base price. Billa and dm store no deals (no validity window), so nothing changes there. **Lidl correction:** its printed unit price belongs to the price shown now, i.e. the offer price while a promotion runs; it used to be recorded as the *regular* unit price too, and is now scaled up to the regular price. Existing deal rows keep `NULL` (no unit price is invented for them; an active one is filled by the next ingestion run, since `upsertActiveDeal()` refreshes it). Where it is used: the "Další nabídky obchodů" cards on Domů show it ("169,00 Kč/kg", `offerUnitPriceLabel()`). **Not done:** product search (`hitUnitPrice()`) and the shopping planner still derive a promotion's unit price from the regular one, and offers without a regular price are still absent from them.

**Update 2026-09-25, full-catalog backfill script.** The daily cron reads a small, *stable* batch per store (the same products every day, so price history stays continuous) — running it more often would re-read the same products, not add new ones, and Hobby crons run at most once a day anyway. The initial fill of the catalog is therefore a separate one-off: `pnpm db:backfill-prices <stores…|all> [--apply] [--limit N]` (`scripts/backfill-prices.ts`) runs on a developer machine with no function time limit and reads each store's **whole** catalog through the cron's own pipeline — same connectors, validation and `ingestPrices()` persistence — with `fullCatalog` set (`FetchOptions`): dm selects every sitemap id instead of 1 in 20 (`selectSampleIds(ids, limit, 1)`), Rohlík pages every category to its end (200 per page, stops at the first short page, hard cap 100 pages); Lidl, Billa, Penny and Košík already walk their whole catalog when the limit allows. Dry run by default (fetch + validate, no writes); `--apply` writes to the database in `.env.local`, with progress every 250 products. Idempotent (products keyed by the store's own id; an unchanged same-day price is not rewritten), so an interrupted run can simply be restarted. **Live dry run 2026-09-25 (no writes):** Lidl 238 fetched / 209 usable (its slug keyword filter is the limit, see above), Billa 9,423 / 9,417 (1 min), Penny 38 / 35 (all current offers), Rohlík 11,550 / 11,411 with 1,533 dated deals (3.3 min), Košík 13,112 / 12,460 with 1,124 dated deals (5.4 min); dm verified on 500 of its ~13,000 ids (471 usable). Writes cost ~0.4 s per product from outside the database's region, so a full `--apply` of every store takes hours; per store is practical. **Not done:** the daily cron still refreshes only its stable batch, so backfilled products outside it keep the backfill day's price until a rotating cursor (proposed next step) or another backfill refreshes them. The backfill has **not** been run with `--apply` yet.

**Update 2026-09-25, rotating daily refresh of the whole catalog; unchanged prices are confirmed, not duplicated (migration `0026`).** After the full-catalog backfill a store holds up to ~13,000 products, so the cron no longer reads a fixed small sample: each large catalog is split into parts of under ~2,000 products (`PRICE_SOURCES[].parts`: Billa 5, Rohlík 6, dm 7, Košík 7; Lidl and Penny are read whole), and each run refreshes one part. The split is deterministic (`lib/ingestion/parts.ts`: a numeric id by remainder, a string by FNV-1a hash — Billa by SKU after walking its whole listing, Rohlík and dm by product id, Košík by sub-category slug). The new table `ingestion_cursors` remembers the next part per store; `runPriceSources()` reads it, runs that part and moves it on (also after a truncated run, so one oversized part cannot block the rest; a run that threw keeps its cursor). `vercel.json` schedules several daily entries per large store — Billa and Rohlík 3, dm and Košík 4 — through the alias route `/api/cron/ingest-prices/<store>/<2–9>` (Hobby allows each entry once a day; the number only makes the path unique, the cursor picks the part), so every product is re-read about every two days. `lib/ingestion/cron-schedule.test.ts` keeps `vercel.json` and `PRICE_SOURCES` in step. **Storage:** re-reading ~37,000 products that often would have added a row per product per read (~0.4 kB each — gigabytes a year against the free tier's 0.5 GB). Now an unchanged price on a later day only sets `prices.last_confirmed_at` on the open row (`planOfficialPrice()` action `confirm`); a new row is written only when the price changes. Product search orders and dates the current price by `coalesce(last_confirmed_at, observed_at)`, so a confirmed price is shown as current ("cena z …") and is not beaten by an older receipt price. **Measured live (read only):** part 1 of Billa 1,854 products in 16 s, dm 1,920 in 17 s, Rohlík 1,319 in 49 s, Košík 1,871 in 43 s (from outside the database's region; plus the writes, a few dozen ms each in-region). **Trade-off:** a new promotion on a product can reach the app up to ~2 days late (before, only the few hundred sampled products per store were read, but daily). **Not done:** existing duplicate same-price rows written daily before this change are left as they are (no compaction).

**Update 2026-09-25, Globus flyer offers (migration `0028`).** Globus publishes its national weekly flyers at `globus.cz/globus/letaky`, and the flyer viewer loads, per flyer page, a small JSON with that page's offers (`action-offers.globus.cz/<page hash>.json`): barcode, name, package size, offer price, the struck-through regular price where there is one, the printed unit price and the validity dates. `lib/ingestion/globus.ts` reads the listing page (it holds the hashes of every current flyer page, ~170), then each page file sequentially with a pause. `robots.txt` allows `/globus/letaky` (it disallows product-detail pages and per-hypermarket offer listings, neither used); `action-offers.globus.cz` declares no restriction; no login or challenge. **Rules** (same as Penny): the regular price is recorded only when the flyer strikes one through; otherwise only the deal; the members-only `clubPrice` is ignored; an ended offer (an old flyer still listed) is rejected whole; a printed unit price must agree with price ÷ package size, and a piece priced per kilo is rejected as ambiguous; rolls and doses count as pieces, as the flyer prices them. **Identity:** the EAN field — a barcode, or for the fresh counter Globus's internal code (e.g. grapes `107107`). **Scope:** food (departments 61–64, 73–75 except cut flowers 739, 80, 82, 83 and the uncoded fresh counter) and household chemistry (65); textiles, shoes, toys, appliances etc. are not imported. **Chain-wide deals:** a national flyer holds at every hypermarket, so its deals have no branch (`PriceConnector.chainWideDeals`, like an online chain) — Globus had no branch in the app; its hypermarkets now come with the OpenStreetMap import (`globus` added to its brands). Daily cron `/api/cron/ingest-prices/globus` at 06:00 UTC, read whole. **Live dry run 2026-09-25:** 1,062 offers on 8 current flyers → 744 usable, all with a dated deal. Not yet written to the database.

**Update 2026-09-25, Kaufland flyers researched — reachable, but only as PDF text (same situation as Albert).** kaufland.cz itself stays behind its Cloudflare verification page (not bypassed). But Kaufland's store site `prodejny.kaufland.cz` is open (its `robots.txt` disallows only offer-detail pages and client libraries) and its home page links the current flyers by identifier, e.g. `CZ_cs_KDZ_3300_CZ39-LFT` (the weekly flyer, week 39, price region 3300) and `CZ_cs_Hyper1_3300_CZ39-CL1` (a themed catalogue). The flyer viewer at `leaflets.kaufland.com` (the Schwarz group's leaflet platform, as for Lidl) reads `endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=<id>` — public, no login or challenge, no `robots.txt` — which returns the flyer's dates (`offerStartDate`/`offerEndDate`), 54 pages and a `pdfUrl`, but **no product data**: `products` is empty, `showProductDetails` is false, pages have no product links, and each page's `keyWords` is an unordered bag of names and prices that cannot be paired. The PDF (16 MB, 54 pages) has a **text layer**, like Albert's: names, prices ("24,90"), old prices and discounts ("-37%") are there, but in reading order, with a page's prices in one run and its names elsewhere — pairing them needs either the text positions on the page or a model. Also: prices are per region (the identifier carries `3300`); which regions exist and how they map to stores is not yet known. **Conclusion:** Kaufland and Albert need the same thing — a PDF-flyer pipeline — and the choice between positional parsing and a (free-tier) model is the open owner decision. Throwaway checks only; nothing built.

**Update 2026-09-25, receipt files can move to Cloudflare R2 (not active yet).** The Vercel Blob store is over its usage limit, so receipt storage now goes through `lib/storage/` (Vercel Blob or R2, chosen for new uploads by `STORAGE_PROVIDER`, default `vercel` = previous behavior). `receipt_imports.image_url` holds a storage reference — a Blob URL for every existing receipt, `r2:receipts/{householdId}/{uuid}.{ext}` for R2 — so each row is read from its own provider and no migration was needed. R2 is used from Vercel over its S3 API (`aws4fetch`), private bucket, keys validated on every access. `scripts/migrate-vercel-blob-to-r2.ts` (`pnpm db:migrate-blob-to-r2`, `--dry-run`, `--rollback <log>`) copies old receipts with a size + SHA-256 check and never deletes Blob files. The app itself stays on Vercel (owner scope decision). **Not verified yet** against a real R2 bucket (waiting for the owner's bucket and token), and the DB-backed receipt tests were not run in the cloud session. Details: `docs/cloudflare-r2.md`, `docs/cloudflare-migration-status.md`.

**Research status across every chain/source checked so far (2026-09-23), roughly in the order investigated** — see section 15 for the full detail behind each:
* **Lidl** — connector built and running (daily cron pilot, see above).
* **Albert** — fully checked (site, GraphQL API, flyer viewer, and the "Můj Albert" loyalty app). No structured price source found anywhere; the loyalty app is mobile-only and would need a real phone number for SMS verification to even investigate further. Stays blocked until a human does that step, or a completely different source (Wolt/Foodora) is checked.
* **Billa** — connector built 2026-09-24 (JSON category API, pilot of 80; see section 15). Originally the strongest grocery candidate checked. Fully open `robots.txt`, 12,267-product sitemap, rich embedded per-product data (including real package size/unit, which Lidl and this app's own catalog both still lack) via the page's Nuxt `__NUXT_DATA__` payload or its embedded schema.org `Offer` markup. No CAPTCHA. Ready for a connector to be designed whenever this becomes the priority.
* **Kaufland** — re-confirmed blocked with a real headless-browser check (not just the original `curl`): a flat HTTP 403 from Cloudflare on both `robots.txt` and the homepage. Stays off-limits.
* **Penny** — connector built 2026-09-24 (see section 15): an offers-only source — the whole web catalog is the current week's ~38 offers, all with real validity dates.
* **DM drogerie** — connector built 2026-09-24 (see section 15): the first non-grocery source, feeding Drogerie/Děti/Domácnost via the products.dm.de tile + detail API, pilot of 80.
* **Tesco (itesco.cz)** — not one of the original 6 chains either, checked at the owner's request. Blocked the same way as Kaufland (a flat HTTP 403, this time from Akamai's edge rather than Cloudflare), confirmed with both `curl` and a real headless-browser check. Stays off-limits.
* **JIP** — the sixth and last chain named in `CLAUDE.md` section 14, now checked. No consumer price source: its main site is flyer-images-only (like Albert), and its real e-shop (`jip-eshop.cz`, B2B/gastronomy anyway) has a blanket `Disallow: /` in `robots.txt` — a clean stop, no exploration attempted. Confirmed dead end, same bucket as Albert and Kaufland.
* **Teta drogerie** — a second drugstore chain, outside the original 6-chain list. As clean as DM: 36,834-product sitemap, real schema.org `Offer` data readable via plain `curl` on an allowed page path. One nuance to respect going forward: its `robots.txt` explicitly disallows `/price` and `/api/` — a real connector must stick to the allowed `/eshop/katalog/...` pages and never touch those two paths.

* **Makro** — a wholesale/Cash & Carry chain, outside the original list. Blocked the same way as Kaufland/Tesco (flat HTTP 403, confirmed with `curl` and a real browser) — and would have been wholesale pricing anyway, not representative of retail, even if it weren't blocked.

* **Rossmann drogerie** — a third drugstore chain, outside the original list. Fully open `robots.txt`, 17,779-product sitemap, real price/product data readable via plain `curl` through a standard GA4 `dataLayer` object (no JSON-LD Product schema on this one, but an equally standard alternative). No CAPTCHA.

* **Rohlík.cz** — a pure online grocery delivery service, outside the original list. Very likely the strongest grocery source found in this whole pass: explicit `robots.txt` welcome for AI crawlers by name, 19,973-product sitemap, full schema.org `Offer` plus real package size/unit and an already-computed normalized unit price and a distinct sale-price field, all via plain `curl`. No CAPTCHA.

* **Košík.cz** — a second pure online-grocery delivery service, outside the original list. Also very strong: 33,960-product sitemap (two files), a clean `/api/front/product/slug/<slug>` JSON endpoint (not restricted by `robots.txt`) with real package size, normalized unit price, promotion fields, and country of origin. Client-rendered SPA, so a browser is needed to see the call — a plain `curl` alone isn't enough, unlike Rohlík. No CAPTCHA.

* **Globus** — a hypermarket chain outside the original list, checked at the owner's request (see section 15). Viable: 35,053 product URLs in the sitemap (none blocked by `robots.txt` under standard wildcard matching, though the per-branch URL variants *are* disallowed and must never be used), full product record via plain `curl` in the Nuxt `__NUXT_DATA__` payload with real EAN barcodes and structured before/after promotion prices. Two caveats: prices are per-branch (default Praha-Čakovice; cross-branch variance unverified) and the payload's `unitAmount` can disagree with its own size text, so it needs validate-and-flag treatment. ~1.5 MB per page, so a small pilot only. No CAPTCHA.

* **Foodora Market** — a delivery-app grocery service (10 Prague dark stores, 6,184 products; its `shop` listings also cover Albert/Billa/Penny/Tesco/Globus partner stores), checked at the owner's request (see section 15). Product pages carry good data (price, normalized unit price, barcode, 30-day minimum price) via plain `curl`, **but a real browser gets HTTP 403 + a PerimeterX human-verification challenge on both product and shop pages**. Treated as blocked (no bypass); would need an official partner/API route. Does **not** unlock Albert: the Albert shop page's menu loads client-side behind that same challenge.

* **Wolt (Wolt Market + partner stores)** — a delivery platform, checked at the owner's request (see section 15). Open `robots.txt`, no bot challenge in a real browser, item data (with real barcodes, minor-unit prices, `lowest_price`, and a pre-computed unit price) readable via plain `curl` in a page's JSON state. Its 20,000 listed item URLs cover 11 Wolt Market venues plus **Albert (6,891), Billa, Kaufland (1,347), Tesco, Globus, Penny** partner stores — so it is the first source with *any* structured Albert or Kaufland prices. Big caveat, measured on 6 shared Globus products: barcodes matched 6/6 but prices only equalled in-store on 4/6 (one higher on Wolt, one promo not passed through), so Wolt data must be stored as a distinct "delivery price" source, never as the chain's in-store price. Research only; ToS not reviewed.

**All 6 original chains now researched.** Working connector: Lidl. Viable but not yet built: Billa, Penny, Rohlík.cz, and Košík.cz (Rohlík and Košík are likely the two strongest grocery candidates overall). Confirmed dead ends: Albert, Kaufland, JIP. Also researched outside the original list (owner-initiated): DM drogerie, Teta drogerie, and Rossmann drogerie (all three viable, `'Drogerie'` category), Tesco and Makro (dead ends, both blocked like Kaufland).

## Currency/localization

Database foundation exists, but UI and domain-wide localization still require work.

## Test database

Database-backed tests (Server Actions, `lib/db/*` queries, receipt API routes) run against a separate Neon branch, never production: `test/setup-test-database.ts` swaps `DATABASE_URL` for `TEST_DATABASE_URL` before every test file and clears it when no test URL is set, so those tests fail instead of writing to production. Set up once:

1. In the Neon project, create a branch from `main` named `test` (console: Branches → New branch; or `npx neonctl branches create --name test`). A branch is a copy-on-write copy, so it starts with the production schema and data.
2. Put its pooled and direct connection strings into `.env.local` as `TEST_DATABASE_URL` and `TEST_DATABASE_URL_UNPOOLED`.
3. After a new migration, run `pnpm db:migrate:test` as well as `pnpm db:migrate`. To start from fresh production data again, reset the branch from its parent (console, or `npx neonctl branches reset test --parent`) and re-run the migrations.

Tests still clean up after themselves; leftovers from an interrupted run now stay on the test branch, where a reset removes them. Neon Auth is not involved: tests create their users directly in the branch's `neon_auth.user` table.

## Server action tests

Started 2026-09-21, now covers every file in `app/actions/`: `shopping.test.ts`, `household.test.ts`, `budget.test.ts`, `notifications.test.ts`, `meal-plan.test.ts`, all as integration tests against the real dev database. `requireHouseholdId()`/`requireHousehold()` and `next/cache`'s `revalidatePath()` are mocked, since both need a real Next.js request context a test process doesn't have; `acceptInvitationAction` additionally needed `@/lib/auth/server`'s `auth.getSession()` mocked, since it authorizes off a real session rather than `requireHousehold()`. Everything else — authorization checks, DB writes, notification logic, the budget-threshold and meal-plan-upsert behavior — is the real code running for real.

## Authorization tests

Started 2026-09-21, expanded same day: every Server Action that takes a client-supplied resource id (list/item, household member, child, invitation, notification) now has a test confirming an id belonging to a different household is rejected rather than trusted from the client. `inviteMemberAction`/`revokeInvitationAction`'s owner-only role check is also covered. Full session/cookie-level authentication testing (an actual signed-in browser session, not a mocked one) is not attempted — that would need e2e testing (e.g. Playwright) against a running dev server, not unit/integration tests.

## Purchase analytics

Real purchases can now be created (`completePurchaseAction`, see section 21) — the analytics functions in `lib/purchase-history.ts` finally have a real write path feeding them, not just seed data. Deeper analytics beyond what's already there (average monthly spend, favorite store, most-bought products, repeat purchases) are still open. The receipt-import idea raised by the owner is now scaffolded (`app/actions/receipts.ts`, `lib/receipts.ts`, `receipt_imports` table — see section 33): manual entry works today and produces a real purchase; the actual OCR/vision extraction step is an explicit placeholder (`unimplementedOcrProvider`) pending the AI phase, and there's no image upload/storage yet either.

**Update 2026-09-22:** The owner provided a full target design for the real OCR pipeline (Google Cloud Vision for OCR, a cheap structuring model like Gemini Flash-Lite, validation/confidence/duplicate-detection rules, a full import state machine) — captured verbatim as `docs/08_OCR_RECEIPT_PIPELINE.md`. **Planning only, not implemented** — it calls external AI/model APIs, which `CLAUDE.md` section 30 forbids before the AI phase (or explicit owner authorization as an exception). The doc includes an explicit mapping of the proposal onto the schema/code that already exists (`receipt_imports`, `ReceiptOcrProvider`, `importReceiptAction`) so implementation doesn't accidentally build a parallel system when this phase actually starts.

## Meal-plan ingredient quantities

**Closed 2026-09-23** (see section 20's update): recipes now have real per-ingredient quantity/unit content, authored the same way `price`/`allergens` already were — not external data, so it wasn't blocked by the "no real data source" restriction that applies to prices/promotions/products. Stock matching and cooked-meal pantry deduction are both genuinely quantity-aware now, with real unit conversion (kg↔g, l↔ml) via `convertQuantity()`.

## International rollout

The Czech implementation is the primary target.

International support is planned later.

## Cron authorization

Fully resolved 2026-09-21: `CRON_SECRET` is set in the Vercel project (Production), PR #4 (`v0/backend` → `main`) is merged, and a production deployment ran. Confirmed live via `vercel cron ls`, which now lists `/api/cron/shopping-reminders` (no longer `not deployed`). The route will get its first real scheduled invocation at the next `0 8 * * *` (08:00 UTC) tick.

---

# 28. Recent Completed Work

**2026-09-25, installable app (PWA).** `app/manifest.ts` (served at `/manifest.webmanifest`) makes the app installable to a phone's home screen as "Buddy": standalone display, Buddy icons cropped from the intro artwork (`public/brand/buddy-icon-192.png`, `-512.png`, a maskable 512 with margin for Android's round crop), navy splash background. The default v0 favicons/apple icon were replaced by Buddy (`buddy-favicon-32.png`, `buddy-apple-touch-icon.png`); `appleWebApp` gives iPhone the name Buddy. `proxy.ts` excludes `manifest.webmanifest` from the sign-in redirect (browsers fetch it without cookies). The account menu has **"Stáhnout aplikaci do mobilu"**: in Chromium browsers it opens the browser's own install dialog (the `beforeinstallprompt` event, caught on every page by `lib/install-prompt.ts` loaded from the root layout; Chrome's own banner is left alone); where there is none (Safari on iPhone/iPad, Firefox, or after the offer was dismissed) it shows the steps to add the app by hand for that device (`components/shared/install-app-dialog.tsx`, a native `<dialog>`). Hidden when already running as the installed app. No service worker: Chrome no longer requires one to install, so there is no offline mode or cache to keep in sync. **Checked:** Chrome's `Page.getInstallabilityErrors` reports none; the menu item and the iPhone steps in a real browser at iPhone size with a throwaway account (deleted afterwards). **Not checked:** the actual install dialog on a physical Android phone (headless Chrome does not fire the event).

Recent development has included:

* Neon persistence for household/profile data
* shopping-list persistence
* budget persistence
* expense persistence
* notification persistence
* database-backed stores
* database-backed prices
* database-backed deals
* meal-plan persistence
* Neon Auth integration
* protected routes
* household authorization
* household invitations
* shared household membership
* owner/member roles
* concurrent-edit refresh strategy
* nationwide store directory expansion
* GPS/manual location handling
* Smart Shopping Engine foundations
* budget threshold notifications
* price/deal alert notifications
* time-scheduled shopping-reminder notifications (Vercel Cron)
* household-join event notifications (Phase 8 now fully complete: budget/deal/reminder/household-event notifications)
* price-history foundation: append-only observation recording + historic-low detection (not yet fed by a real ingestion source)
* real `productId` link from shopping-list items to the catalog (was dead schema; the whole app matched on free-text names before this), plus a native autocomplete on the input so typed text has a real chance of matching
* real purchase-history write path (`completePurchaseAction`, "Dokončit nákup") — `purchases`/`purchase_items` were seed-only and read-only until now; also fixed a data-inventing bug found along the way (`?? 'Lidl'` store fallback)
* household pantry ("spíž"): `pantry_items` table, automatic restocking on purchase, a daily check-in cron, confirm/remove Server Actions, and UI nested in the shopping-list tab (see section 32)
* pantry locations (spíž/lednice/mrazák/domácnost/lékárnička/drogérka — six since 2026-09-24, shown in the Zásoby tab as folder tiles with an icon, item count and check/out-of-stock badges; only the opened folder's items are listed) with keyword-based auto-assignment (all six; non-food items go to lékárnička/drogérka only on a clear medicine/personal-care keyword, otherwise domácnost, and can always be moved by hand) and manual moves between any two locations; stock-aware meal-plan generation and per-meal regeneration; marking a cooked meal deducts its ingredients from the pantry; OCR-ready receipt import with manual entry as the working path today (see section 33)
* fixed a migration-history drift bug (`_migrations` tracks by filename, not content — an already-applied migration had been edited after the fact) that would have produced a different schema on a fresh database than today's dev database (see section 9)
* fixed a live product-catalog bug where a manual receipt entry's default unit selection could silently overwrite an already-correct `defaultUnit` (e.g. milk's `l` downgraded to `ks`), breaking unit-price normalization for that product; quick-added shopping-list items now also inherit a known product's unit instead of always defaulting to `ks` (see section 12)
* real per-ingredient quantities/units for the recipe catalog, closing the "Meal-plan ingredient quantities" gap — pantry stock matching and cooked-meal deduction are now genuinely quantity-aware with real unit conversion, instead of always treating one recipe use as "1 of whatever" (see section 20)
* first real external price ingestion connector (Lidl CZ) — real grocery products/prices/deals pulled from Lidl's own published sitemap + JSON price endpoint, normalized/validated, and recorded via the existing (previously unused) `recordPriceObservation()`; daily cron with a deliberately small pilot batch (see section 15)
* currency fields
* migration baseline
* automated tests for selected domains
* Server Action / household-authorization tests for every action file, running against the real dev database rather than mocks
* removal of the TypeScript build-error bypass

---

# 29. Important Development Constraints

When continuing development:

1. Do not create a second backend.
2. Do not reintroduce Python/FastAPI.
3. Do not replace Neon/PostgreSQL with SQLite.
4. Do not replace Drizzle without a concrete reason.
5. Do not bypass authentication.
6. Do not bypass household authorization.
7. Do not invent price or promotion data.
8. Do not create fake store locations.
9. Do not duplicate existing domain logic.
10. Do not introduce AI before the final phase.
11. Do not make critical calculations only in the UI.
12. Do not modify unrelated working UI during backend work.
13. Do not add unnecessary dependencies.
14. Do not hide TypeScript/build errors.
15. Do not commit secrets.

---

# 30. Documentation Workflow

When a significant feature is completed:

Update:

```text
docs/01_CURRENT_STATE.md
docs/07_CHANGELOG.md
```

When architecture changes:

```text
docs/02_ARCHITECTURE.md
```

When database structure changes:

```text
docs/03_DATABASE.md
```

When roadmap priorities change:

```text
docs/04_ROADMAP.md
```

When business rules change:

```text
docs/05_BUSINESS_RULES.md
```

When AI rules change:

```text
docs/06_AI_RULES.md
```

Documentation must reflect the actual implementation.

---

# 31. Current Definition of Done

A feature should be considered complete only when appropriate:

* implementation exists
* TypeScript is correct
* database persistence works
* authorization works
* business logic is deterministic
* loading state works
* error state works
* empty state works
* mobile layout works
* tests exist where appropriate
* no obvious regression exists
* relevant documentation is updated
* changelog is updated

The application should remain stable while functionality is expanded incrementally.

---

# 32. Household Pantry ("Spíž")

**Added 2026-09-22.** A new domain, owner-requested, not part of the original Phase 8 notification set (section 19) but following the same deterministic-generator pattern.

The `pantry_items` table (migration `0003_pantry_items.sql`) tracks what a household believes it currently has at home:

* `completePurchaseAction` (section 21) restocks or creates a pantry row for every item in a finished purchase — matched by `productId` when known, otherwise by case-insensitive name, summing quantity rather than overwriting on a repeat purchase.
* A new daily Vercel Cron job, `/api/cron/pantry-checkin` (`vercel.json`, same `CRON_SECRET` auth model as `shopping-reminders`), asks the household "do you still have this?" once a per-category interval has elapsed since an item was added/restocked or last asked about (`lib/pantry.ts`'s `isDueForCheckin()`/`findDueForCheckin()`). Unlike a shopping reminder, this can fire more than once per item — an unconfirmed pantry item stays relevant rather than being a one-time event.
* `app/actions/pantry.ts`'s `confirmPantryItemAction` ("Ještě mám") resets the check-in interval; `removePantryItemAction` ("Došlo") deletes the row outright, since a future purchase creates a fresh one.
* Per-category check-in intervals (`CHECKIN_DAYS_BY_CATEGORY` in `lib/pantry.ts`) are placeholder defaults (10/30/21/30/14 days), an explicit interim choice since there is no real per-product shelf-life data yet to be more precise than category-level.
* UI: a new `Pantry` component (`components/shopping/pantry.tsx`), nested inside the existing "Nákup" tab below the shopping list rather than as a new top-level tab, per section 29 ("preserve existing navigation... only change UI where required").
* Tests: `lib/pantry.test.ts` (pure check-in-interval logic), `app/actions/pantry.test.ts` (cross-household rejection + behavior for both actions), and two `completePurchaseAction` restocking cases added to `app/actions/purchases.test.ts` (new pantry row, and summed-quantity restock with reset `askedAt`).
* Not yet done: the Smart Shopping Engine (section 22) does not consume pantry state to suggest skipping an already-stocked staple — see `docs/04_ROADMAP.md` Phase C. Full interactive browser verification was not performed this session (no browser available in this environment); verification here was `tsc --noEmit`, `next build`, and the full Vitest suite against the real dev database, plus a smoke check that `next dev` serves pages without a server error.

---

# 33. Pantry Locations, Cross-Location Moves, Stock-Aware Meal Plans, and Receipt Import

**Added 2026-09-22**, owner-requested, on top of the Household Pantry work in section 32.

**Pantry locations.** `pantry_items.location` (migration `0004_pantry_locations_and_receipt_imports.sql`) tracks which of four locations an item lives in: Spíž, Lednice, Mrazák, Domácnost. A new row's location is seeded by `lib/pantry.ts`'s `inferPantryLocation()` — non-food categories go straight to Domácnost, "Potraviny" items are split between Lednice/Mrazák/Spíž by a small, explicitly placeholder Czech keyword list (e.g. "mražen", "zmrzlina" → Mrazák; "mléko", "sýr", "maso" → Lednice; everything else defaults to the shelf). Restocking an *existing* row (a repeat purchase) never re-infers the location, so a manual move survives it. `app/actions/pantry.ts`'s new `movePantryItemAction(id, location)` lets the household reassign any item to any location by hand — general-purpose, which also covers the specific "moved chilled meat into the freezer" case without a separate action. The `Pantry` UI (`components/shopping/pantry.tsx`) now groups items into one card per location and exposes the move as a `<select>` per row.

**Stock-aware meal plans.** `lib/meal-plans.ts`'s `generateWeeklyPlan()` takes an optional `pantryItems` argument (a household opt-in checkbox, "Vytvořit ze zásob", in `components/dashboard/meal-plan.tsx`); when supplied, each meal slot prefers whichever candidate recipe in its pool uses the most currently-in-stock ingredients (`matchIngredientToStock()`, case/whitespace-insensitive exact name match, no fuzzy matching — same philosophy as `lib/products.ts`). `splitIngredientsByStock()` then separates the full plan's ingredient list into what's already at home (`fromStock`) and what still needs buying (`toBuy`); "Přidat chybějící do nákupního seznamu" now adds only `toBuy`, regardless of whether stock-aware generation was used — never adding something already in the pantry to the shopping list. **Not modeled**: recipes have no per-ingredient quantity (a shopping-list item defaults to 1 the same way), so "uses stock" and "consumes stock" (below) are both unit-agnostic — one recipe use consumes exactly one unit of whatever the pantry tracks that ingredient in, not a realistic serving size. Real serving-size data doesn't exist yet; inventing it was explicitly avoided.

**Regenerate a single meal.** `regenerateMeal(plan, day, mealType, household, pantryItems?)` swaps out just one day's one meal slot (a "🔄" button per meal in the UI) rather than discarding the whole week, always excluding the currently-shown recipe so a click reliably produces something different; deterministic (no randomness), so it stays unit-testable.

**Mark a meal cooked → deduct from stock.** Each meal now has a "✓" button. `app/actions/meal-plan.ts`'s new `markMealCookedAction(day, mealType)` looks up the household's saved plan for the current week, and for each of that recipe's ingredients, decrements the matching pantry row's quantity by 1 (deleting the row outright if it would hit zero), then records the meal as cooked in the plan's new `cookedMeals: string[]` field (`WeeklyMealPlan`). Idempotent — marking an already-cooked meal again does nothing, so a duplicate click can't double-deduct. Never invents or goes negative: an ingredient with no matching pantry row (or already at zero) is simply skipped. One-directional by design — there is no "unmark" that restores what was deducted, since nothing tracks exactly what a specific marking deducted in order to reverse it.

**Receipt import, OCR-ready.** New `receipt_imports` table (same migration) and `app/actions/receipts.ts`'s `importReceiptAction()` turn a set of line items into a real purchase — same downstream effect as `completePurchaseAction` (one `purchases`/`purchase_items` row set, plus pantry restocking via the same shared `restockPantryItem()`, now moved from `app/actions/purchases.ts` into `lib/db/queries.ts` so both call sites share one implementation). Every import today has `source: 'manual'`: `components/budget/receipt-import.tsx` is a plain hand-entry form (name/category/quantity/unit/price rows, optional store and date) — there is no OCR yet, and the UI says so explicitly rather than pretending otherwise. `lib/receipts.ts` defines the seam a real OCR/vision provider plugs into later (`ReceiptOcrProvider` interface, `ExtractedReceipt` shape) with only a placeholder `unimplementedOcrProvider` that throws — per CLAUDE.md section 30, no AI SDK/vision-model call is wired up before the AI phase. When OCR does arrive, only how `items` gets populated needs to change; the Server Action, schema, and pantry-restocking path do not. **Deliberately not done**: actual image upload/storage (would need a blob-storage integration, a separate concern) — `receipt_imports` has no image column yet, since there's nowhere to put one.

Tests: `lib/pantry.test.ts` (`inferPantryLocation`), `app/actions/pantry.test.ts` (`movePantryItemAction` authorization + behavior), `app/actions/purchases.test.ts` (location inference on a new row, location preserved on restock), `lib/meal-plans.test.ts` (stock-aware generation, `matchIngredientToStock`, `splitIngredientsByStock`, `regenerateMeal`, `markMealCooked`/`isMealCooked`/`recipeFor`), `app/actions/meal-plan.test.ts` (`markMealCookedAction`: deduction, idempotency, zero-quantity row removal, missing-ingredient skip), `app/actions/receipts.test.ts` (`importReceiptAction`: purchase creation, pantry restocking, `receipt_imports` record). 145/145 tests passing; `tsc --noEmit` and `next build` both clean. As with section 32, full interactive browser verification was not performed *in that session* (no browser was available in that environment) — see the follow-up immediately below, where one was added and actually found real bugs unit/integration tests couldn't have caught.

**Update 2026-09-22, browser verification.** `@playwright/test` was added as a dev dependency specifically so a real headless Chromium session could drive this feature end to end against the real dev server and real dev database (sign up a disposable test account, add/buy an item, move it between pantry locations, generate a stock-aware plan, regenerate a meal, mark one cooked, import a receipt). This found two real bugs neither the type-checker nor the test suite could see, since both are about client-side runtime behavior against a live server:

1. **Bulk shopping-list adds could appear to silently do nothing.** `addIngredients()` in `components/app-shell.tsx` (used by "Přidat chybějící do nákupního seznamu" and the older "add all ingredients" button) fired one `addShoppingItemAction` per ingredient concurrently via `Promise.all`. Every insert actually succeeded — confirmed by reloading the page, which showed the correct data — but with a dozen-plus concurrent Server Actions each independently calling `revalidatePath('/')`, the client could apply a stale mid-batch server snapshot over the correct optimistic UI state, leaving the shopping list looking empty until a hard reload. This was always latent (the original "add all ingredients" button could already trigger 20-30 concurrent adds) but went from rare to routine once stock-aware meal plans made large `toBuy` lists common. Fixed by awaiting each add sequentially instead of concurrently, so at most one revalidation is ever in flight. **Known residual limitation, not fixed**: two genuinely *different* slow operations started back-to-back (e.g. triggering another bulk add while one is still mid-flight) can still race the same way, since every Server Action in this app does its own independent `revalidatePath()` with no app-wide serialization. Given how rare that specific sequence is in real use, and per CLAUDE.md's smallest-coherent-change principle, a full fix (e.g. serializing all revalidations globally) was judged out of scope for this fix.
2. **Pantry-location inference rarely worked in practice.** Quick-adding an item via the shopping list's plain text input always defaulted its category to the schema default `'Ostatní'`, even when the typed name matched a real catalog product — `getProductCatalog()` only ever returned `{id, name}`, never the matched product's real category, and `addShoppingItemAction` never used it. Since `inferPantryLocation()` (section 33 above) branches on category, and almost everything added this way landed as `'Ostatní'`, real food items essentially never got auto-routed to Lednice/Mrazák — verified with "Kuřecí prsa" landing in Spíž instead of Lednice. Fixed: `getProductCatalog()` now also returns each product's real category (`ProductCatalogEntry.category`), and `addShoppingItemAction` uses the matched product's category when no explicit override is given. Re-verified in the browser: the same "Kuřecí prsa" item now correctly lands in Lednice.

Both fixes covered by new/updated tests (`app/actions/shopping.test.ts`, `lib/products.test.ts`) in addition to the browser re-verification. 147/147 tests passing; `tsc --noEmit` and `next build` both clean. All disposable test accounts/households created during this verification (`neon_auth.user` + `households`, matched by the `verify*@example.com`/`Verify Tester*` naming used throughout) were deleted afterward — confirmed zero left behind.

**Update 2026-09-22, real OCR implemented — owner-approved exception to the AI deferral.** Between the update above and this one, the actual Google Vision + Gemini OCR pipeline got implemented in the working tree (not yet committed at that point) — a direct contradiction of the immediately preceding commit, which had explicitly documented OCR as "not implemented... forbidden by CLAUDE.md section 30" as planning-only. Caught before committing: found `lib/receipts.ts` importing `generateObject` from the `ai` package (Vercel AI SDK) and calling `google/gemini-2.5-flash-lite` via the AI Gateway, plus new `@vercel/blob`/`ai`/`zod` dependencies, all uncommitted. Flagged to the owner rather than silently continuing or silently reverting. The owner's decision: *"Chci to dokončit, OCR chci mít vyřešené, na konec necháme AI asistenta. Toto AI je pouze pro import účtenek"* — approved as a narrow, explicit exception (documented in `CLAUDE.md` section 30, this file's section 26, and `docs/04_ROADMAP.md`'s Phase G) covering only `lib/receipts.ts`'s structuring call, not the conversational AI Shopping Assistant, which stays deferred. No real API calls had actually happened yet (`GOOGLE_VISION_API_KEY` isn't set locally; tests use fake OCR/structuring providers), so no cost was incurred before this was caught.

Once approved, finished what was left mid-flight:
- Fixed a real compile error: `getHouseholdData()`'s return object was missing the now-required `pendingReceiptImports` field (the fetch existed but was never added to the `Promise.all` batch or the return statement).
- Fixed real test flakiness, not a logic bug: two tests in `app/actions/receipts.test.ts` intermittently hit vitest's 5s default timeout, because several tests there make real sequential Vercel Blob uploads (`createUploadedReceipt()`) and real network latency occasionally exceeded it — confirmed by re-running the same code twice and seeing different tests fail each time. A timed-out test doesn't cancel its in-flight work, so this risked a zombie continuation corrupting the shared `currentHouseholdId`/`db` state a later test in the same file relied on (this is very likely what caused one test to fail with the wrong error message on one run). Fixed by raising this one file's timeout (`vi.setConfig({ testTimeout: 20_000 })`), not by touching the actual pipeline logic. Confirmed stable across two full clean reruns afterward.
- Removed real duplication the gap had introduced: `ReceiptImportState` (type), `toReceiptImportState()`, and `getPendingReceiptImports()` existed independently in both `lib/db/queries.ts` (used by `getHouseholdData()`, exported) and `app/actions/receipts.ts` (a second copy with `purchaseId` and a hardcoded-always-null `storeName` no code ever populated) — despite `queries.ts`'s own docstring already saying they were meant to be shared. The `receipts.ts` copy's `getPendingReceiptImports()` Server Action was entirely unused (no `.tsx` file called it anywhere) — dead code. Consolidated onto one canonical version in `lib/db/queries.ts` (keeping `purchaseId`, dropping the dead `storeName` placeholder); `app/actions/receipts.ts` now imports it instead of redefining it, per `CLAUDE.md` section 37.
- **Built the missing UI** — the entire OCR pipeline was backend/action-only; no `.tsx` file called `uploadReceiptAction` or any of the review/retry/duplicate actions, so a real user had no way to trigger it. `components/budget/receipt-import.tsx` now has a real "Vyfotit nebo nahrát účtenku" upload button (replacing its "OCR not available" message) alongside the existing manual-entry form. New `components/budget/receipt-pending.tsx` surfaces whatever `HouseholdData.pendingReceiptImports` has waiting: a specific error + retry/discard for a failed import, an editable line-item review form for `review_required`, and a three-way use-existing/save-as-new/cancel choice for `duplicate_review`.
- **Verified in a real browser against the real dev database and real Vercel Blob**, not just tests: signed up a fresh account, uploaded a real (tiny, throwaway) image. Since `GOOGLE_VISION_API_KEY` isn't configured locally, this genuinely exercised the failure path end-to-end — confirmed the specific "GOOGLE_VISION_API_KEY is not configured" error surfaced correctly in the UI, confirmed "Zkusit znovu" (retry) correctly failed the same way again, confirmed "Zahodit" (discard) correctly cleared it and set `receipt_imports.status = 'cancelled'` in the database. Then re-verified manual entry still works as a regression check (it created a real `purchases`/`purchase_items` row with `receipt_imports.status = 'imported'`). All disposable test accounts/data deleted afterward, confirmed zero left behind.
- 187/187 tests passing; `tsc --noEmit` and `next build` both clean.
- **Known gap, not closed here:** `GOOGLE_VISION_API_KEY` is set in Vercel for Production only, not Development, so the real OCR text-extraction step (as opposed to the structuring step, which authenticates via Vercel OIDC and would work locally) cannot be exercised against real output locally — see `docs/08_OCR_RECEIPT_PIPELINE.md` section 12.

**Update 2026-09-22, decimal quantities + storage-location resolution + manual stock edits.** Follow-up pass, per the owner's prompt (which itself assumed per-item category recognition already existed — it didn't; `extractedReceiptItemSchema` had no `category` field at all until this pass). Full detail in `docs/08_OCR_RECEIPT_PIPELINE.md` section 12b; summary here:
- Fixed a real bug first, as instructed: `purchase_items.quantity`/`pantry_items.quantity` were `integer`, not `numeric` — a weight-sold receipt item (e.g. "0,582 kg") would have failed to insert or been truncated. Migrated to `numeric(10,3)` (migration `0006_fearless_thunderbolt.sql`); also fixed the manual-entry/review forms, which clamped typed quantity to a minimum of `1`.
- `lib/pantry.ts`'s `inferPantryLocation()` now returns `null` (never a guessed default) when it genuinely can't classify a food item or the category is the catch-all `'Ostatní'`; new `lib/receipts.ts`'s `resolveItemPlacement()` adds catalog priority on top and now gates `processReceiptImport()`'s automatic completion the same way a missing/inconsistent field already did. An unrecognized unit does too (new `isRecognizedUnit()`).
- A human-confirmed correction (manual entry, or a completed review) now writes its category/unit/location back into the `products` catalog (new `default_location` column, `upsertProductCatalogDefaults()`) — including creating the catalog row for a never-before-seen product — so the next receipt of the same product resolves automatically. Never happens on an unreviewed automatic OCR pass.
- The review form (`components/budget/receipt-pending.tsx`) gained a "Datum" field it was previously entirely missing (a review triggered by a missing date had no way to supply one — `confirmReceiptReviewAction` would have silently used today's date; now it throws instead if none is given) and an "Uložení" select per item.
- New `adjustPantryItemQuantityAction` + a pantry stepper UI for manual stock correction (`−`/exact-value/`+`), separate from purchase history, never touching `purchase_items`.
- Verified in a real browser against the real dev database: decimal quantity round-tripped exactly through manual entry → purchase history → pantry → stepper edit → reload; a seeded `review_required` import correctly showed one blank (ambiguous) and one pre-filled (catalog-resolved) location select, stayed disabled until both a date and every location were set, and produced a purchase with the explicitly-typed date; the confirmed correction was verified written into the product catalog. All test data cleaned up afterward.
- 224/224 tests passing (was 194); `tsc --noEmit`/`next build` clean.

---

# 34. Current Development Principle

The current priority is not to add the largest number of features as quickly as possible.

The priority is to build a reliable foundation:

```text
Reliable data
      ↓
Reliable backend
      ↓
Reliable business logic
      ↓
Reliable shopping optimization
      ↓
Useful automation
      ↓
AI assistance
```

AI should not compensate for missing or unreliable application foundations.

The current focus is therefore the backend and data layer on:

```text
v0/backend
```
---

# 35. Context Continuity

The project now uses a persistent documentation layer to prevent loss of context during long change sequences.

Documentation roles:
- docs/01_CURRENT_STATE.md — what is actually true now; branch, verification state, architecture and current work.
- docs/02_PROJECT_CONTEXT.md — stable long-term technical rules and data semantics.
- docs/03_CHANGELOG.md — significant changes and verification history.
- docs/04_DATABASE_MODEL.md — conceptual database rules; actual Drizzle schema remains authoritative.
- docs/05_TEST_PLAN.md — regression and critical workflow tests.
- docs/06_KNOWN_ISSUES.md — still-relevant issues and recurring failure modes.

When making a substantial change:
1. inspect current state and schema,
2. make the smallest coherent change,
3. test/typecheck/build as applicable,
4. verify the actual runtime workflow when relevant,
5. update CURRENT_STATE and CHANGELOG,
6. record the commit SHA and verification result.

The documentation must never claim a build, deployment, migration or runtime test passed unless it was actually verified.
