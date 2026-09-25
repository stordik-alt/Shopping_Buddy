# Shopping Buddy — Neon Database Rules

## Database
Neon PostgreSQL 18 is the persistent database.

The initial schema already contains:
`users`, `households`, `household_members`, `profiles`, `children`, `preferences`, `product_categories`, `products`, `product_external_refs`, `member_stores`, `shopping_list_item_pins`, `stores`, `store_locations`, `prices`, `deals`, `shopping_lists`, `shopping_list_items`, `budgets`, `expenses`, `purchases`, `purchase_items`, `meal_plans`, `notifications`, `pantry_items`, `receipt_imports`, `ingestion_cursors`, `flyer_pages`.

There is also a `neon_auth` schema.

## Rules
1. Treat the actual Neon schema as authoritative after verification.
2. Never assume the initial schema is final.
3. Before altering a table, inspect columns, types, nullability, defaults, indexes and constraints.
4. Before changing relationships, inspect foreign keys.
5. Use migrations for schema changes.
6. Never silently drop or truncate production data.
7. Prefer UUID identifiers where the existing schema uses them consistently.
8. Store monetary values using exact numeric/decimal database types, not floating point.
9. Prices must have explicit currency.
10. Time-sensitive prices/deals need effective/valid dates.
11. Product identity must eventually distinguish product/brand/variant/package/unit where required for correct price comparison.
12. Historical purchase records must remain stable even if a current product or price later changes.
13. Household access must be enforced server-side.
16. `shopping_list_item_pins` holds at most one pinned product per shopping-list item and chain (unique index); `member_stores.is_priority` may only be set on chain-level rows (CHECK); `household_members.max_shop_stores` is 1–6 (CHECK).
15. Product text search uses `products.search_name`, a stored generated column (the name without diacritics, lower-cased). It is derived by the database and must never be written by the application; its character map is shared with `lib/product-search.ts`.
14. Official (retailer-published) prices: the CURRENT price of a product at a store is its `prices` observation with the latest `observed_at`. There is at most one `OFFICIAL` observation per product + store + retailer SKU (`source_reference`) + day (partial unique index `prices_official_daily_unique`); a repeat run the same day refreshes that row, and older data never displaces a newer observation. When the same price is seen again on a later day, no row is added: the open observation's `last_confirmed_at` is set to that day (the price is known to hold from `observed_at` to `last_confirmed_at`), so `prices` grows with real price changes, not with how often a catalog is read — the database is on the Neon free tier (0.5 GB). When the price changes, the previous observation is kept as the OLD price and closed with `valid_until` = the date the new price was first observed (the change happened on or before that date; the exact day is unknown). Where the current price is chosen across sources by date (product search), the date is `coalesce(last_confirmed_at, observed_at)`. `observed_at` is the real calendar date in Czech time, not the app's fixed demo date. Receipt-based observations are not covered by the unique index (several purchases a day are separate facts).
15. `ingestion_cursors`: one row per retailer source (`product_source` enum, primary key) with `next_part` — the part of that store's catalog the next rotating price refresh reads (see `PRICE_SOURCES` in `lib/ingestion/ingest.ts`). Missing row = part 0.
16. `store_locations` imported from OpenStreetMap carry `source` = 'osm' and `external_id` (the map object, `node/123`); the pair is unique (partial index `store_locations_source_external_id_unique`) and both are set or neither (check `store_locations_source_pair`). `opening_hours` holds OSM `opening_hours` syntax; `last_seen_at` is the last import that still found the branch. Seeded and receipt branches have no source until an import adopts them.
17. `flyer_pages`: what a model read off one page of an image-only flyer (Albert, `lib/ingestion/albert.ts`) — primary key (`source`, `flyer_id`, `page_number`), the flyer's store format (`location_type`) and validity, the raw `offers` (jsonb, re-validated on every read), the model and its token counts. A page is sent to the model once; later runs read it from here. Rows of flyers that ended more than 90 days ago are pruned by the import (the deals themselves stay in `deals`).
18. The composite foreign keys (`store_location_id`, `store_id`) of `member_stores` and `deals` cascade on update (migration `0030`): a branch moved to another chain of the same retailer (an Albert hypermarket to "Albert Hypermarket", `lib/stores/albert-formats.ts`) takes those rows along. `prices`, `purchases` and `receipt_imports` carry `store_id` without a composite key and are updated in the same transaction by `syncAlbertStoreFormats()`.
14. Multi-table writes that represent one user action should use a transaction.

## Authentication
The `neon_auth` schema exists. Inspect it before implementing auth. Avoid building a second independent authentication system unless there is a verified requirement.

## Data migration strategy
Migration order should generally be:
1. audit existing schema
2. fix/extend schema
3. add typed data-access layer
4. connect one feature at a time
5. migrate/seed required reference data
6. remove mock usage only after real persistence works
7. validate existing user flows
