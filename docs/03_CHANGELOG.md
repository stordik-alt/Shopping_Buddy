## 2026-09-23 — Historical UNKNOWN branch backfill
- Added `scripts/backfill-receipt-store-locations.ts` for a controlled one-time backfill of historical receipt imports without a resolved branch.
- Default execution is DRY RUN; `--apply` is required to change data.
- Existing branches are matched by normalized address/city; missing OCR-discovered branches are created.
- Linked purchases receive the resolved `store_location_id`.
- Historical RECEIPT price observations are updated only when the matching receipt/product/date relationship is unambiguous. Ambiguous prices remain UNKNOWN.
- The backfill has not been executed against production from this session because direct Neon SQL execution is not available through the connected runtime.

## 2026-09-23 — OCR auto-creation of store branches
- Purpose: when OCR reads a physical branch address that is not yet in the store directory, create the missing branch instead of leaving the receipt permanently UNKNOWN.
- Schema: migration `0011_receipt_auto_create_store_locations.sql` makes coordinates/opening hours nullable for newly discovered branches and adds a normalized chain/address/city uniqueness guard.
- Backend: `app/actions/receipts.ts` now resolves an existing branch or creates one from OCR address/city data; the same resolver is used for automatic completion and human-confirmed review.
- Data integrity: coordinates and opening hours are never invented from receipt OCR; they remain NULL until enriched by a trusted source.
- Verification: regression coverage added for branch creation, assignment and repeat-import deduplication. Runtime migration/build verification is still pending.

## 2026-09-23 — Price observation model
- Purpose: make current prices and price history provenance-safe before connecting real retailer feeds.
- Schema: migration `0010_price_observation_model.sql` adds explicit retailer chain, nullable branch, scope, source type, location-resolution state, validity window, source reference and confidence; existing branch-linked rows are backfilled without deleting history.
- Backend: `recordPriceObservation()` now appends contextual observations and validates STORE/UNKNOWN vs STORE/RESOLVED semantics; `getProductPrices()` derives the latest value from the observation ledger while preserving history and provenance.
- Receipt flow: receipt prices are stored as STORE + RECEIPT, with RESOLVED when the branch is known and UNKNOWN when it is not.
- Verification: migration `0010_price_observation_model.sql` was applied successfully to the production Neon database; the application recovered from the previous React Server Component #441 error after the schema was brought in sync with the deployed code.
- CI: GitHub Actions run `35844035366` for commit `8e77d634fcd50a5ea2928ec5b9868d7e6b247295` completed successfully (unit checks, typecheck and build).
- Commit sequence: `298e03b3cdd37b817bac48cdf1748f7d30355bee` through `8e77d634fcd50a5ea2928ec5b9868d7e6b247295`.

# Shopping Buddy — Change Log

This file records significant architectural and data-model changes.

## 2026-09-23 — Context and change-safety framework
- Established persistent project-context documentation.
- Separated long-term context from current project state.
- Established CURRENT_STATE / PROJECT_CONTEXT / CHANGELOG / DATABASE_MODEL / TEST_PLAN / KNOWN_ISSUES roles.
- Established that UNKNOWN store locations remain STORE observations and are never treated as CHAIN prices.
- Established automatic branch backfill only for UNKNOWN records and only on unambiguous matches.

## 2026-09-22 — Receipt/OCR foundation
- Receipt import and OCR pipeline implemented and browser-verified through failure/manual paths.
- Receipt data supports products, quantities, units, dates, currency, store information and location resolution.
- Decimal quantities migrated to numeric(10,3).
- Catalog-confirmed corrections can persist product defaults.
- Pantry location handling avoids guessing when classification is ambiguous.

## 2026-09-22 — Mobile receipt upload
- Receipt upload was made reliable on mobile.

## 2026-09-22 — Purchase/store handling
- Purchase history uses the stored purchase store and displays an unknown-store fallback instead of inventing a store.

## Rule
Every future significant change should add a dated entry containing:
- purpose
- files/schema affected
- verification performed
- known limitations
- commit SHA when available
