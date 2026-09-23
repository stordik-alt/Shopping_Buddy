# Shopping Buddy — Regression Test Plan

## Critical receipt flow
1. Upload receipt.
2. OCR/extract data.
3. Resolve store.
4. Resolve products.
5. Resolve branch if possible.
6. Create purchase and purchase_items.
7. Record price observations.
8. Restock pantry where applicable.
9. Show history correctly.

## Required location cases
### Known branch
Expected: STORE + concrete store_location_id + RESOLVED.

### Unknown branch
Expected: STORE + NULL location + UNKNOWN. Item and price are still stored.

### OCR discovers a new branch
Expected: a new `store_locations` row is created from the OCR address/city, assigned to the receipt/purchase, and reused by a later import of the same normalized address. Coordinates/hours remain NULL until enriched by a trusted source.

### Unknown -> resolved
A later unambiguous address/location match may update only UNKNOWN observations.

### Ambiguous match
Remain UNKNOWN.

### Already resolved
Automatic UNKNOWN resolver must not change it.

## Required source cases
- RECEIPT and OFFICIAL for the same product may coexist.
- OFFICIAL chain price is CHAIN.
- RECEIPT unknown branch is STORE, not CHAIN.
- Source and observation date are preserved.

## Product cases
- Multiple OCR products create separate items.
- Decimal quantities survive round-trip.
- Unit price is not divided by quantity.
- Product IDs remain stable where resolved.

## Regression gates
Before merging a substantial change, run as available:
- TypeScript check
- Vitest suite
- Next build
- targeted integration/browser test for changed workflow
- deployment verification when Vercel access is available

## Verification rule
A passing unit test is not sufficient for client/server workflows that can fail at runtime. Use browser or integration verification where the change affects live UI, Server Actions, uploads or database behavior.
