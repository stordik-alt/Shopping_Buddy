## 2026-10-09 — Aktuální pravidla resolveru Product Subtype
- **Pivo:** pouze „Alkoholické pivo“ a „Nealkoholické pivo“; barva není poddruh. Výchozí je „Alkoholické pivo“, pokud důkazy výslovně neuvádějí nealkoholické/nealko/bez alkoholu nebo obsah alkoholu 0 %.
- **Těstoviny:** známé tvary plus „Ostatní“ pro obecně označené skutečné těstoviny. Fleky a orzo jsou krátké tvarované, hnízda dlouhé. Hotová jídla a směsi se vylučují.
- **Rýže:** přidána „Rýže na sushi“ a „Ostatní“. „Rýže loupaná“ bez dalších důkazů spadá do Ostatní. Ryzec smrkový/borový je houba, nikoli rýže.
- **Tvaroh:** jediný poddruh „Tvaroh“ bez rozlišení konzistence, tuku či ochucení. Tvarohové jogurty, pomazánky a výrobky typu Mlsni.si tvaroh Pikao jsou vyloučeny.
- **Tavený sýr:** přidán poddruh „Ostatní“. Apetito a Veselá kráva slouží jako vodítko pro obecné zařazení, pokud není doložena forma.
- **Tuňák v konzervě:** české varianty „v/ve … oleji“ se sjednocují. Pomazánky, saláty a hotová jídla se vylučují.
- Resolver zůstává čistý, deterministický a pouze návrhový. Nemění existující přiřazení a nezapisuje do databáze.

## 2026-10-09 — Manual GitHub Actions dry-run for Product Subtype candidates
- Added `.github/workflows/product-subtype-candidate-ingest-dry-run.yml`, triggered manually through `workflow_dispatch`.
- The workflow previews the 24 draft registry-expansion candidates using the candidate ingest CLI without `--apply`; it cannot insert/merge candidates or assign products.
- Uses the GitHub Actions secret `NEON_PROD_DATABASE_URL` only to satisfy the CLI's configuration guard; the dry-run branch does not execute database queries.
- Verification: workflow syntax and CI are pending review; this workflow has not yet been run. No production writes or product assignments were performed.

## 2026-10-09 — Product Subtype registry expansion proposals
- Added a review document covering the largest unmapped Product Types from read-only audit run `37910630603`, including explicit hold/review notes for overlapping classification axes and questionable parent types.
- Added 24 draft candidate proposals for Pivo, Těstoviny, Rýže, Tvaroh, Tavený sýr and Tuňák v konzervě in a CLI-compatible JSON input file.
- Proposals remain unapproved and have not been ingested into the database candidate queue. No active subtype, product assignment, migration or production write was performed.
- Verification: JSON structure and proposal count checked in the authoring workflow; CI/CLI dry-run has not yet been run.

## 2026-10-09 — Product Type inventory for subtype registry expansion
- Extended the read-only Product Subtype mapping audit to group every product with an existing Product Type but no reviewed starter-registry mapping by stable Product Type key.
- Each group includes product count, category and Product Type provenance breakdowns, plus up to three deterministic example products; groups sort by descending product count then stable key.
- This inventory is evidence for the next registry-review phase only. It does not infer new subtype identities, seed the registry, or change product assignments.
- Added regression coverage for group counts, category/provenance breakdowns, deterministic sample ordering and exclusion of products without Product Type.
- Verification: merged in PR #393 (`2a5442eeedd5130d958f6157ae28f9c3ced5b4f8`); read-only production audit completed successfully in run [37910630603](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37910630603). No production writes or migrations performed.

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

## 2026-10-09 — Product Subtype audit candidate safety fix
- Restricted automatic audit candidates to trusted provenance (`rule`, `alias`, `pkd`); unknown/manual assignments remain review-only and existing subtype assignments are not proposed again.


## 2026-10-09 — Product Subtype audit hardening and production baseline
- First production audit attempt failed without a surfaced PostgreSQL cause; a retry succeeded with the same code, so the original failure cause remains unconfirmed.
- Added schema-readiness detection and a safe legacy-schema fallback; direct read-only inspection confirmed production has the subtype table/columns and currently 0 assigned subtypes.
- The audit respects all allowed Product Type categories instead of treating the primary DB category as the only allowed value, and treats product default-unit vs price-comparison-unit differences as informational.
- Production baseline: 55,842 products; 7,656 with Product Type; 48,186 without; 1,364 candidates across seven starter parents; three `voda-neperliva` records in category `Děti` need review.
- No production data or product assignments were changed.


## 2026-10-09 — Product Subtype deterministic mapping audit
- Added a read-only mapping layer from reviewed legacy Product Type keys to a proposed parent Product Type and exact registered Product Subtype.
- Automatic candidates require trusted `rule`, `alias` or `pkd` provenance; manual/unknown provenance, category exceptions, existing subtype assignments and types outside the starter registry remain excluded from automatic mapping.
- Added `lib/product-subtype-mapping.ts`, regression tests and `pnpm db:audit-product-subtype-mapping`.
- Added manual GitHub Actions workflow `.github/workflows/product-subtype-mapping-audit.yml`, using `NEON_PROD_DATABASE_URL` and the read-only mapping runner.
- No database writes or subtype assignments were performed.

## 2026-10-09 — Fix mapping audit unit test
- Corrected the summary regression expectation: the summarizer includes only subtypes represented by mapping rows, so an unrepresented lactose-free subtype must not appear with zero counts.
- CI failure reproduced from PR #389; no production data was changed.

## 2026-10-09 — Stabilize Product Subtype mapping summary order
- Replaced locale-dependent sorting with explicit key ordering and aligned the regression expectation to that deterministic order after CI exposed a localeCompare ordering mismatch.
- No production data changed.


## 2026-10-09 — Production Product Subtype mapping audit results
- Recorded the successful read-only production run of `scripts/audit-product-subtype-mapping.ts`.
- Baseline: 55,842 catalog products; 1,361 automatic mapping candidates; 3 concrete records held for manual review; 0 existing subtype assignments; 54,478 products outside the current starter registry; 19 subtypes represented in the report.
- Candidate breakdown: Káva 414, Sýr 341, Voda 290 automatic candidates (plus 3 manual-review records), Olej 163, Mléko 79, Mouka 45 and Cukr 29. Water subtype counts: neperlivá 133 automatic + 3 manual review, perlivá 157.
- Held out from automatic assignment: `HiPP Baby přírodní minerální voda neperlivá 6×1 l`, `HiPP Baby přírodní minerální voda neperlivá multipack (6×1 l)`, and `YESs Meloun neperlivá`. All are proposed as `voda-neperliva` but have category `Děti`; category and taxonomy fit must be reviewed explicitly.
- Clarified that 54,478 products outside the starter registry are not automatically errors. The audit is read-only, has no `--apply` mode, and did not seed or backfill data.
- Next gate: validate report completeness, review candidates and exceptions, then prepare a separate reviewed seed/backfill plan with preconditions, dry-run diff, idempotency checks, manual-assignment protection, post-run audit and rollback strategy. No production write is authorized by this audit.

## 2026-10-09 — Extensible Product Subtype registry for retailer feeds
- Documented that new Product Subtypes may be proposed and reviewed before any concrete catalog product exists.
- Defined stable subtype identity, required scope/boundary evidence, parent Product Type, and the distinction between subtype identity and retailer SKU/EAN/package data.
- Defined the future retailer-feed flow: normalize source data, match approved types/subtypes, queue missing subtypes as candidates, review/deduplicate, approve, then map products; ambiguous matches remain review/unknown.
- This is a documentation-only decision. No production subtypes, product assignments, or retailer imports were created or changed.

## 2026-10-09 — Product Subtype candidate review workflow
- Added migration `0085_product_subtype_candidates.sql` and the Drizzle model for a review queue separate from active subtypes.
- Added deterministic Czech-label normalization, stable candidate keys, deduplication within a parent Product Type, and source/evidence preservation.
- Added CLI actions to list, dry-run/ingest, explicitly approve, or reject candidates. Approval requires a written definition plus include/exclude boundaries; duplicate names are routed to duplicate status.
- Approval creates only the reusable subtype. It does not assign or rewrite existing catalog products. Ingest writes require explicit `--apply`; no production command or migration was run.
- Candidate proposals can be queued before a parent Product Type has a database row; approval waits until the parent is active. Added a synthetic JSON example for normalized feed input.
- Final hardening: migration constraint names now match the Drizzle schema; repeated ingest merges unique source IDs and include/exclude boundaries, and the queue resolves parent names by stable key even before the parent row is linked.
- Added unit tests for normalization, deduplication, parent scoping and approval gates. Runtime tests/CI remain to be verified.
- Implementation branch: `feat/product-subtype-candidate-workflow`.

## 2026-10-09 — Product Subtype exclusion reason audit
- Extended the read-only mapping audit with mutually exclusive reason codes for automatic candidates, existing assignments, missing Product Type, Product Types outside the starter registry, category mismatch, and untrusted provenance.
- Each reason group reports its count and up to 20 concrete product samples with IDs, names, category, current Product Type and provenance.
- Added a reconciliation guard: the sum of all reason groups must equal the catalog row count or the audit fails.
- Reason-group samples are ordered by stable product ID so repeated read-only runs show reproducible examples.
- Added regression tests for reason exclusivity/reconciliation and for keeping Product Type provenance distinct from subtype assignment provenance.
- No production writes, backfill or subtype assignments were performed.


## 8. Pravidla hranic a precedence pro rozšiřování poddruhů — 2026-10-09

Nové návrhy poddruhů musí určit jednu rozhodovací osu nebo explicitní prioritu pro případy, kdy výrobek splňuje více vlastností. Vlastnosti jako odrůda, zpracování, účel použití, tvar a balení se nesmějí bez pravidla smíchat do sourozeneckých poddruhů.

- Přiřazení vyžaduje výslovný důkaz z etikety nebo důvěryhodné specifikace. Název, který pouze naznačuje vlastnost, není dostatečný. Pokud je důkaz neúplný či konfliktní, ponechat produkt bez poddruhu / k revizi.
- Je-li potřeba právě jeden subtype, priorita musí být deterministická a otestovaná. Priorita neznamená, že ostatní vlastnosti přestávají platit; znamená pouze výběr jednoho kanonického subtype.
- Tvar balení, počet kusů, hmotnost, značka, EAN a SKU zůstávají atributy produktu nebo balení, nikoli poddruhy.
- Pro návrhy z 2026-10-09 jsou konkrétní priority a hranice popsány v `docs/product-subtype-registry-expansion-review.md` a v definicích JSON kandidátů. Tyto návrhy nejsou schváleny a nesmějí být automaticky použity k přiřazování produktů.


## 2026-10-09 — Deterministic Product Subtype evidence resolver

- Added `lib/product-subtype-evidence-resolver.ts`, a pure, deterministic, versioned resolver for the six proposal families `pivo`, `testoviny`, `ryze`, `tvaroh`, `taveny-syr` and `tunak-konzerva`. It is not wired into runtime classification, imports, seed code, or product writes.
- The resolver preserves evidence source, field, original value, matched rule and candidate-relative polarity (`supports` / `contradicts`). Sources are product name, product description, verified attribute, and verified manufacturer specification. In `verifiedAttributes`, use a `manufacturer_spec:` prefix (or `manufacturer_spec` as the whole key) only for data actually verified against a manufacturer specification; all other supplied attributes must already be verified.
- Decision contract: `match` has one `proposedSubtypeKey` and `reason: null`; `review` and `no_match` never propose a subtype and always have a reason. Existing assignments return `review / existing_assignment` and are never overwritten. Unsupported Product Types return `review / unsupported_category`; missing explicit evidence returns `no_match / insufficient_evidence`; unresolved equal-priority evidence returns `review / conflicting_evidence`.
- Priority policy follows the reviewed candidate boundaries: beer requires explicit colour; pasta uses filled → lasagne sheets → soup/small → long → short-shaped; rice uses basmati/jasmine → arborio/risotto → natural/wholegrain → parboiled → other long/round grain; quark fat class must be explicit and is never inferred from a percentage; processed cheese uses portioned → sliced → spreadable product form, not package count; tuna distinguishes own juice, oil and generic water, with own-juice wording taking precedence over generic water only.
- Added unit tests and the read-only `pnpm db:simulate-product-subtype-expansion` command. A manual GitHub Actions workflow runs the simulation against the catalog using `NEON_PROD_DATABASE_URL`. The query currently supplies product name, brand and variant only; it does not join a standalone description, manufacturer specification or verified-attribute source, so the catalog simulation cannot claim evidence from those unavailable fields.
- No subtype candidates were approved, no production registry entries were activated, and no database assignments or data were written. The 24 expansion proposals remain proposal-only.


## 2026-10-09 — Review of production subtype simulation

- Successful read-only run 37928914569 processed all 1,572 products belonging to the six expansion families from 55,842 catalog products. It returned 910 proposed matches, 6 conflicting cases for review and 656 products without sufficient explicit evidence; there were 0 existing subtype assignments in the catalog at the time of the run.
- The report revealed that generic word `plátky` is not adequate evidence for *plátkový tavený sýr* because it can describe ordinary Gouda slices. The rule now requires explicit processed-cheese wording together with the sliced form. Package counts (e.g. `8 ks`) remain insufficient to classify portioned cheese.
- Added explicit phrase variants for tuna packed in olive oil (e.g. `v olivovém oleji`). Abbreviated/unclear labels are still not guessed.
- The report is a proposal-only text simulation, not an approved assignment plan. Results require review; no catalog records were updated.

## 2026-10-09 — Post-fix Product Subtype simulation

- Read-only run [37930358171](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37930358171) ran on `main` commit `73f9e314c381c96ee089a7511f9d32760fc9d501` and returned full details for all 1,572 items in the six target families.
- Results vs. run `37928914569`: 919 matches (+9), 7 conflicts/reviews (+1), and 646 items with insufficient explicit evidence (-10). Catalog size and target-family size stayed at 55,842 and 1,572; no subtype assignments existed for the target families.
- Regression checks confirmed `Apetito Gouda plátky 90g` is now `no_match`, and `Rio Mare Tuňák v olivovém oleji 160g` maps to the oil subtype proposal.
- Seven mixed-option/conflicting labels remain for human review. The abbreviation was addressed in PR #401 and revalidated by read-only run [37936816105](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37936816105) on commit `72e7db6e85f5e32dbb32a23e73337e88fd8434fc`: matches increased from 919 to 921, conflicts/reviews stayed at 7, and insufficient-evidence cases fell from 646 to 644. The two added matches were checked in the detailed report: `Rio Mare Tuňák v ol.oleji` and `X_BILLA TUNAK V OL.OLEJI 3X80 G`; both are tuna products and both match the explicit normalized phrase `v ol oleji`. The unrelated pasta control remains unmatched, so no false positive was found in the tested controls; no fuzzy oil inference was introduced.
- The run processed all 1,572 target-family products from 55,842 catalog products and reported zero existing subtype assignments. It explicitly ran READ ONLY with no INSERT/UPDATE/DELETE and no assignment changes. Output is still proposal-only; no data or assignments changed and all 24 candidates remain unapproved.


## 2026-10-09 — Registry-first bulk taxonomy bootstrap (first step)

The next phase changes from reviewing individual PKD candidates to building a broad reusable registry and then mapping candidates in bulk.

- The registry must cover general kinds of goods beyond the current catalog. Existing catalog names and PKD candidates are evidence, not the complete universe of Product Types.
- GS1 GPC, Open Food Facts and CZ-CPA are reference taxonomies. Their labels/codes must not be copied blindly as Czech Product Types or concrete products.
- Product Type is the general identity; Product Subtype is an optional child classification. Brand, package size, multipack count, EAN and retailer SKU remain product/package attributes.
- The 40k candidate pool must be analyzed in aggregate: status, category/subcategory, source evidence, duplicate normalized names, confidence and exact matches to the active registry. Do not review all rows manually.
- First implementation step: manual GitHub Actions workflow `.github/workflows/product-taxonomy-bootstrap-inventory.yml` runs `scripts/audit-product-taxonomy-bootstrap.ts` in READ-ONLY mode and uploads a JSON report artifact. It reports the current catalog/type/subtype baseline and ranked candidate evidence; it does not write to production.
- Next step after reviewing the report: create a versioned, broad Product Type/Subtype seed proposal by domain, validate definitions and include/exclude boundaries, then bulk dry-run candidate mapping and measure coverage. Only the explicitly approved seed/backfill stage may write registry rows or product assignments.
- Acceptance criteria: deterministic/idempotent proposal generation; no brand/package/SKU-derived types; duplicate normalized identities are consolidated; candidate and catalog coverage are reported separately; unresolved/ambiguous cases remain review-only; no existing manual assignments are overwritten.


## 2026-10-09 — Bootstrap audit: candidate suitability/source correction

The first production dry-run confirmed that the candidate table mixes genuine product identities with source taxonomy labels/definitions, service activities, non-Czech terms and incomplete legacy evidence. The stored confidence score is an evidence-generation score, not a suitability score for a Czech retail Product Type.

- Audit preview now excludes non-Czech labels, very short normalized names, obvious definition/service/activity labels and exact matches to existing Product Types.
- Report distinguishes source-engine confidence from suitability filtering, reports language and inferred source/version, and includes duplicate groups for review.
- Missing category/subcategory remains missing; the audit does not guess either one. Legacy candidates lacking source metadata stay unknown/mixed and cannot be auto-approved.
- This changes only the READ-ONLY audit/report; candidate rows and production taxonomy remain unchanged.


## 2026-10-09 — Bootstrap preview: exclude commercial activities

A read-only aggregate query against the candidate table showed that the first suitability filter still admitted commercial/service labels such as retail/wholesale activity, distribution, transport, construction, accommodation, catering and repair work. These are not retail Product Types.

- Extracted candidate review rules into `lib/product-type-candidate-suitability.ts` so they can be unit-tested.
- Added an explicit `possible_commercial_activity` flag and excluded these labels from the Czech retail Product Type preview.
- Added positive controls for goods labels (e.g. coal, diapers, milk) and negative controls for service/commercial activity labels.
- This remains a proposal filter only. It does not delete source evidence, approve candidates, create registry entries, or assign products.
