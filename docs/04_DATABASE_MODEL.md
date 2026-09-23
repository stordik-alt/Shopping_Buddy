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

## Price observations
The price model distinguishes:
- physical-store observation
- store-format observation
- regional observation
- chain-wide published price

It also distinguishes source:
- receipt
- official
- flyer
- API
- other

### Critical semantic rule
Receipt + unknown branch:
- store_id known
- store_location_id NULL
- scope STORE
- source RECEIPT
- location_resolution UNKNOWN

This must not be treated as a chain-wide price.

## Historical integrity
Prices are append-only observations where practical. Do not overwrite historical observations when a new source reports another price.

## Backfill
Backfills must be additive or narrowly corrective. Never delete real purchase or price history just to accommodate a schema improvement.

## Migrations
All schema changes require Drizzle migrations. Before migration:
1. inspect current schema
2. inspect indexes and constraints
3. inspect all call sites
4. consider existing data
5. prepare a safe backfill if needed
