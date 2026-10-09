## 2026-10-09 — Product Subtype registry conflict resolution
- Recreated the review-only Product Subtype registry on a fresh branch based directly on merged `main` after PR #385 became non-mergeable due to the foundation-merge ancestry.
- No database schema, production data or active classification was changed; the registry remains candidate-only.
- Verification: registry tests and CI are pending on the replacement PR.

## 2026-10-09 — Product Subtype CI and PKD confidence fixes
- Routed `lib/db/product-subtypes.test.ts` out of the database-free unit job and into the isolated PostgreSQL test job.
- Rounded PKD candidate confidence scores to two decimal places so deterministic scoring no longer emits floating-point artifacts.

## 2026-10-09 — Product Subtype database foundation
- Added the `product_subtypes` table with stable subtype identity, explicit parent Product Type, ordering and active/inactive status.
- Added the nullable `products.product_subtype_id` relation and database constraints that prevent assigning a subtype under a different parent or without a Product Type.
- Added `product_subtype_source` to retain `rule`/`manual`/`alias`/`pkd` provenance and enforce a valid, paired source for every subtype assignment.
- Added migration `0084_product_subtypes.sql` and regression coverage in `lib/db/product-subtypes.test.ts`.
- This is schema groundwork only: no subtype registry was seeded, no catalog products were reclassified, and no production migration was applied.
- Verification: CI passed on application-code commit `3a1849bc6cf6cec7bfeaad80f8559f24a4124b4c` (unit tests, typecheck/build, isolated PostgreSQL integration tests, Playwright and Cloudflare build); security audit passed. No production database was changed.
- Detailed entry and next steps: `docs/07_CHANGELOG.md`; canonical model: `docs/12_PRODUCT_TYPES.md`.

## 2026-10-09 — Product Type / Product Subtype hierarchy clarified
- Established the canonical hierarchy **Typ zboží → Poddruh → konkrétní Produkt → balení/množství → EAN/SKU/obchod/cena**.
- Typ zboží is the general, reusable identity (for example `Mléko`); Poddruh is an optional finer classification (for example `Trvanlivé mléko` or `Čerstvé mléko`). Neither may encode brand, package size, EAN or retailer SKU.
- A Product Type can contain many subtypes and each subtype can contain many concrete products. Product packaging and quantity remain separate from classification.
- The existing Group concept remains separate: a group can contain several Product Types that the planner may treat as alternatives.
- GS1 GPC, Open Food Facts, CZ-CPA, own catalog and OCR are documented as discovery/knowledge evidence for the registry, not as a direct Product Type/SKU list.
- The previous 2026-10-v5 cross-reference candidate direction is explicitly superseded by this model; further candidate generation must follow the registry-first concept.
- Documentation: `docs/12_PRODUCT_TYPES.md`.
- Verification: documentation-only change; no database data was changed.
- Commit: `300fb142146714d7d18342463010088fec455135`.

## 2026-10-09 — PKD implementation milestones recorded
- PKD source ingestion and normalization/deduplication are now documented as separate knowledge-layer steps before mapping to the application's Product Types.
- GS1 GPC, Open Food Facts and CZ-CPA imports remain external taxonomy evidence and do not directly create Product Types.
- The PKD mapping engine is constrained to exact normalized Product Type names/synonyms; broad receipt-line classification is not used for formal taxonomy mapping.
- Candidate generation and mapping/acceptance are separated: discovery produces candidates, while Product Type creation/mapping requires explicit review and must not overwrite existing manual assignments.
- Quantity normalization is universal across goods and remains separate from Product Type identity; unknown conversions are not guessed.
- Verification: these milestones are already recorded in `docs/12_PRODUCT_TYPES.md`; this changelog entry consolidates the previously undocumented architectural milestones without claiming a new production run.

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


## 2026-10-09 — Product Subtype provenance-aware audit
- Added a deterministic, read-only audit before any Product Subtype backfill.
- The audit reports current Product Type coverage, classification provenance, registry coverage, unassigned/outside-registry products, existing subtype assignments and possible category/unit divergence.
- Added a local runner, a manual production workflow using `NEON_PROD_DATABASE_URL`, and regression tests.
- No database writes or product reclassification were performed.
