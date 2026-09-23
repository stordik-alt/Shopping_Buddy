# Shopping Buddy — Project Context

## Purpose
Long-term technical context for Shopping Buddy / Family Shopping Assistant.

## Core rule
Never invent data. Preserve uncertainty explicitly. Distinguish actual purchase prices from official or published prices.

## Price model
A price observation is an immutable historical fact. The current price is derived from the latest applicable observation rather than stored as a mutable singleton.

The current schema contains:
- product_id
- store_id
- store_location_id (nullable)
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

Exact schema names and types must always be verified against the current Drizzle schema before implementation.

### price_scope
- STORE — physical store
- STORE_FORMAT — store format
- REGION — region
- CHAIN — entire chain

### source_type
- RECEIPT
- OFFICIAL
- FLYER
- API
- OTHER

### Receipt with known branch
STORE + concrete store_location_id + RECEIPT + RESOLVED.

### Receipt with unknown branch
STORE + store_location_id=NULL + RECEIPT + UNKNOWN.

UNKNOWN branch is NOT a CHAIN price. It is a real purchase from a physical store whose exact location is not yet known.

### Official chain price
CHAIN + store_location_id=NULL + OFFICIAL.

Never overwrite a receipt observation with an official price.

## Automatic UNKNOWN resolution
Only records with location_resolution=UNKNOWN are candidates for automatic backfill.

A later receipt/source may resolve an older UNKNOWN record when:
- same chain
- unambiguous address/location match

If the match is ambiguous, keep UNKNOWN.

Already RESOLVED records must never be automatically overwritten by this process.

## Receipt pipeline
Preserve store/chain, address/city, branch when resolvable, date, currency, product, quantity, unit and price.

ReceiptLineItem.price is already the unit price; do not divide it by quantity.

## Development principles
1. Inspect current repository and schema before changing anything.
2. Make the smallest coherent change.
3. Update all call sites when changing a shared function or type.
4. Do not use any to hide type errors.
5. Preserve existing functionality.
6. Run tests, typecheck and build when available.
7. Never claim verification that was not actually performed.
8. Keep historical data; prefer safe backfills over destructive resets.
9. Database changes require Drizzle migrations.
10. Keep commits logically separated.

## Repository
GitHub: stordik-alt/Shopping_Buddy
Stable: main
Active backend development: v0/backend

## Technology
Next.js 16, React 19, TypeScript, Tailwind, shadcn/ui, Neon PostgreSQL, Drizzle ORM, Neon Auth, Vercel.

## OCR
Receipt OCR is an approved narrow AI use case. It is not the general AI Shopping Assistant. Preserve the existing provider architecture and do not broaden AI scope without explicit approval.

## External retailer data
Priority chains include Lidl and Albert. Official sources may provide chain-level prices without branch identity. Do not fabricate branch assignments.

## Data flow
External source -> fetcher -> normalizer -> validator -> database -> price/promotion logic -> UI.

Respect source access restrictions; do not bypass CAPTCHA, authentication or technical access controls.
