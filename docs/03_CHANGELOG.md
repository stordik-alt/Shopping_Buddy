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
