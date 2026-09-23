# Shopping Buddy — Database Model Notes

## Source of truth
The actual Drizzle schema and migrations in the repository are authoritative. This document records conceptual rules and must not replace schema inspection.

## Main domains
- households
- household_members
- profiles
- children
- preferences
- product_categories
- products
- stores
- store_locations
- prices
- deals
- shopping_lists
- shopping_list_items
- budgets
- expenses
- purchases
- purchase_items
- meal_plans
- notifications
- invitations
- receipt_imports
- pantry_items

## Store hierarchy
stores = chain
store_locations = physical branches

store_location_id may be NULL when the branch is unknown.

Receipt OCR branch discovery:
- If OCR provides a physical address and no matching branch exists for the chain, a new `store_locations` row is created.
- `address` is the source-of-truth location evidence from OCR; `city` is stored when OCR provides it.
- `lat`, `lng` and `hours` may remain NULL for an OCR-created branch until trusted store-directory data enriches it.
- A normalized chain + address + city unique index prevents duplicate branches from repeated OCR imports.

## Price observations
The prices table is an append-only observation ledger. It does not store one mutable current-price row.

Each observation contains:
- product_id
- store_id — retailer chain, always explicit
- store_location_id — nullable when the branch is unknown or the scope is chain-wide
- regular_price
- unit_price
- currency
- price_scope
- source_type
- location_resolution
- observed_at
- valid_from / valid_until
- source_reference
- confidence

### price_scope
- STORE — physical-store observation
- STORE_FORMAT — store-format observation
- REGION — regional observation
- CHAIN — chain-wide published price

### source_type
- RECEIPT
- OFFICIAL
- FLYER
- API
- OTHER

### location_resolution
- RESOLVED — physical branch is known
- UNKNOWN — physical branch is not known
- NOT_APPLICABLE — branch resolution does not apply, e.g. CHAIN

### Critical semantic rule
Receipt + unknown branch:
- store_id known
- store_location_id NULL
- scope STORE
- source RECEIPT
- location_resolution UNKNOWN

This must not be treated as a chain-wide price.

### Current price
The current price is derived from the latest applicable observation for the same product/retailer/context. Historical rows are never overwritten.

## Historical integrity
Prices are append-only observations. A new source creates a new observation; it does not mutate or replace an older observation.

## Backfill
Backfills must be additive or narrowly corrective. Never delete real purchase or price history just to accommodate a schema improvement.

## Migrations
All schema changes require Drizzle migrations. Before migration:
1. inspect current schema
2. inspect indexes and constraints
3. inspect all call sites
4. consider existing data
5. prepare a safe backfill if needed
