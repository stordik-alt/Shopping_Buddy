## 2026-09-23 — Price observation model
- Purpose: make current prices and price history provenance-safe before connecting real retailer feeds.
- Schema: migration `0010_price_observation_model.sql` adds explicit retailer chain, nullable branch, scope, source type, location-resolution state, validity window, source reference and confidence; existing branch-linked rows are backfilled without deleting history.
- Backend: `recordPriceObservation()` now appends contextual observations and validates STORE/UNKNOWN vs STORE/RESOLVED semantics; `getProductPrices()` derives the latest value from the observation ledger while preserving history and provenance.
- Receipt flow: receipt prices are stored as STORE + RECEIPT, with RESOLVED when the branch is known and UNKNOWN when it is not.
- Verification: GitHub Actions CI was triggered after the change; the final run must be checked before declaring tests/typecheck/build green.
- Known limitation: the Neon connector currently does not expose a usable project ID for direct migration verification, so migration application against the real database has not been claimed.
- Commit sequence: `298e03b3cdd37b817bac48cdf1748f7d30355bee` through `6a4b3d90ccc982261d7100b4319ab533bba35c19`.

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
