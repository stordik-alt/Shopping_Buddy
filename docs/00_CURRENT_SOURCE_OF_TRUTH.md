# ANITKA — Current Project Source of Truth

Status: current operational reference
Last verified: 2026-10-08
Repository: stordik-alt/Shopping_Buddy
Stable branch: main

## 1. Product identity

The current product identity is ANITKA. The repository name Shopping_Buddy is technical/history only. Do not reintroduce the old generic Shopping Buddy identity into user-facing UI, branding, visual design, copy, screenshots, or new product documentation.

ANITKA is a Czech-market family shopping assistant covering household profiles, shopping lists, prices and promotions, store comparison, budgets, purchases/receipts, pantry, recipes/meal planning, notifications, and controlled AI/OCR utilities.

## 2. Production architecture — authoritative

Current production is Vercel + Next.js 16.3.8 + React 19 + Neon PostgreSQL 18 + Cloudflare R2 + Neon Auth.

Cloudflare Workers/OpenNext is NOT the current production host. It is a prepared future/staging path. Do not describe ANITKA as a Cloudflare production application.

The full hosting migration to Cloudflare is a separate future project. The completed R2 migration is independent of that hosting migration.

## 3. Current stack

- Next.js 16.3.8
- React 19
- TypeScript 5.9.3
- Tailwind CSS 4.x
- shadcn/ui
- lucide-react
- pnpm 12.6.0
- Neon PostgreSQL 18
- Drizzle ORM 0.45.2
- Neon Auth
- Cloudflare R2
- Vitest 5
- Playwright 1.63
- OpenNext Cloudflare 1.20.6 for the prepared future path

Use the versions in package.json as authoritative when this document differs.

## 4. Storage

Receipt/object storage is already migrated to Cloudflare R2.

- R2 is the only application receipt-storage provider.
- Vercel Blob is retired from application code.
- Storage access goes through lib/storage/.
- Receipt references use the r2:receipts/{householdId}/{uuid}.{extension} form.
- The R2 bucket is private.
- Household authorization occurs before reads.
- R2 credentials are server-only.
- Do not reintroduce @vercel/blob, STORAGE_PROVIDER, or a Vercel Blob provider without an explicit owner reversal.

Reference: docs/cloudflare-r2.md.

## 5. Database and migrations

Production uses Neon PostgreSQL 18 with Drizzle ORM. Schema changes require repository migrations in lib/db/migrations/.

The production Vercel build runs lib/db/migrate.ts --vercel-production before next build. A migration therefore can apply before the new application build becomes live. New migrations must remain compatible with the currently serving code.

Required process: inspect schema/relations/indexes/constraints, create migration, test it on the test branch, merge, deploy, then verify production directly.

Migration 0055_receipt_import_purchase_index.sql added the receipt_imports.purchase_id index. It was verified as applied in production after the 2026-10-07 deployment.

## 6. Database performance rules

Database optimization must be evidence-driven. Before adding an index, inspect the real query, existing indexes, table size, pg_stat_user_tables, pg_stat_user_indexes, and query plans where useful. Consider both Neon compute and data transfer.

Do not add indexes merely because a foreign key exists. Tiny tables with sequential scans are not automatically problems. Do not make blind index additions when application workload evidence is insufficient.

Current audit findings include strong targeted coverage on products, prices and deals, trigram search for product names, and high index use on product_subcategories. pg_stat_statements currently does not provide enough application workload history for blind query/index conclusions.

## 7. Neon cost and transfer investigation

Previously observed Neon usage showed data transfer materially above physical database size. This can come from repeated result transfer, imports, synchronization, catalog processing, cron jobs, or other workload. Do not attribute it to one source without evidence.

Investigate compute, data transfer, DB size, table/index statistics, query plans, ingestion volume, cron frequency and request patterns together.

## 8. Application architecture

Preferred flow: UI → Server Actions/Route Handlers → domain/business logic → data access → Drizzle → Neon.

Critical calculations stay outside React components. Authorization is server-side. Household scope is verified server-side. Do not trust client household/user IDs, ownership flags, or roles. Do not introduce a second backend.

### Budget (concept: `docs/15_BUDGET_PERIODS.md`)

The budget runs on a computed **budget period**, never stored: `households.budget_period_type` is `calendar`, `payday` (with `budget_period_start_day` 1–28; day 1 is the calendar month) or `custom` (`budget_period_anchor` + `budget_period_length_days`). The period arithmetic lives only in `lib/budget-period.ts` (`PeriodConfig`); `lib/budget.ts` builds the budget maths on it, and a bare number there is shorthand for "payday N". The server reads the config in one place (`lib/db/period-config.ts`) and sends it to the client as `household.budgetPeriod`; the period is set in Rozpočet → Plánování (`updateHouseholdAction` writes all period columns together). Incomes (`incomes`, `planned` → `actual` on the same row) and the balance formulas (`lib/budget-balances.ts`) are implemented; Kapsy (`pockets`, `pocket_transfers`), period closing (`period_closings`) and the carry-over transfer between periods are implemented (`lib/budget-closing.ts`, `lib/db/period-ledger.ts`): the period result and the carry are always recomputed from real data, never stored, and money moves only on the user's confirmation. Deficit prediction and advice (docs/15 §16–17, `lib/budget-forecast.ts`) are implemented as deterministic text suggestions from known money only (actual balance, planned income, unpaid recurring payments, remaining planned Kapsa contributions); they never move money. Planned expenses (`planned_expenses`), the financial reserve (`pockets.is_reserve`), closing recommendations (`lib/budget-recommendation.ts`) and period history (`lib/budget-history.ts`) are implemented. Planning ahead is implemented too (`lib/budget-outlook.ts`, `planned_carries`): the running period and 12 more can be planned (planned incomes and expenses, a planned transfer to the next period), the outlook is deterministic from known money plus each period's budget, and nothing planned counts as actual money.

## 9. Authentication and household security

Production authentication uses Neon Auth. Every household-scoped operation must verify authenticated membership on the server. Never bypass authentication, authorization, CAPTCHA, rate limits, or access controls.

## 10. AI policy

The conversational AI Shopping Assistant remains a later phase. Do not add general agents, embeddings, recommendations, or conversational model calls without an explicit owner decision.

There are narrow approved exceptions for deterministic utility pipelines such as selected receipt/flyer extraction. Inspect the current implementation and AI/OCR documentation before changing any model, provider, or pipeline. Never assume that a historically documented model is enabled in production.

## 11. Data ingestion and catalog

Ingestion covers retailer/store data, prices, promotions/flyers, recipes, receipts, and seed/catalog data. Preserve provenance where applicable. Never invent prices, promotions, store locations, product facts, or OCR values.

Products are not identified by display name alone. Preserve brand, variant, package size, unit, normalized quantity, barcode/external references where available. Do not collapse products solely because names look similar.

## 12. UI and ANITKA visual identity

ANITKA is mobile-first. Important data-driven screens must handle loading, success, empty and error states.

For significant UI changes: use realistic local DB data, run locally, verify with Playwright, capture screenshots, inspect them visually, and keep coherent visual changes together. Do not redesign unrelated screens during backend work.

## 13. Testing

Backend/database changes require relevant unit/integration, schema/migration and authorization checks. UI changes require Playwright and realistic local DB data, with screenshot inspection for significant visual work.

For production-impacting changes, verify the actual production layer being claimed. A PR is not proof of production state. A successful deployment is not proof that a migration ran. A migration is not proof that application behavior is correct.

## 14. Git and deployment workflow

Stable branch: main.

Preferred flow: main → feature/fix branch → tests → pull request → merge → Vercel production deployment → post-deploy verification.

Do not make backend development changes directly on main. Vercel Git auto-deployment is intentionally disabled in vercel.json via git.deploymentEnabled=false. Deployments are controlled explicitly.

## 15. Vercel cron

Vercel owns the current production cron schedule. The authoritative list is vercel.json. Do not arbitrarily reduce, duplicate, or move jobs without measuring Neon compute, data transfer, import correctness and downstream effects.

The prepared Cloudflare cron configuration is not active production ownership.

## 16. Cloudflare future path

R2 storage is production and complete. Cloudflare hosting/OpenNext is prepared but not production. Staging and future migration procedures remain documented separately. Never change Cloudflare Worker deployment settings while assuming they control current production.

## 17. Documentation hierarchy

When deciding what is true, use this order:
1. explicit current owner decision
2. verified production behavior
3. current repository implementation
4. current database schema/statistics
5. current configuration
6. current documentation
7. historical documentation

If documentation conflicts with verified code or production state, verify the implementation/database, determine actual behavior, then update the incorrect documentation. Preserve useful historical documents.

## 18. Current-state verification checklist

For meaningful changes verify the applicable layers: repository implementation; schema/migration; tests; local UI/Playwright; production deployment; production database; external storage; documentation.

## 19. Documentation maintenance rule

Architectural or operational changes must update this document or the relevant authoritative document in the same PR when they alter production architecture, database behavior, storage, deployment, cron ownership, authentication, AI/OCR policy, testing requirements, operations, or product identity.

The objective is one reliable current-state reference for future agents, while retaining historical feature documents as history.
