# ANITKA — Current Project Source of Truth

Status: current operational reference
Last owner update: 2026-10-17
Repository: stordik-alt/Shopping_Buddy
Stable branch: main

## 1. Product identity

The current product identity is ANITKA. The repository name Shopping_Buddy is technical/history only. Do not reintroduce the old generic Shopping Buddy identity into user-facing UI, branding, visual design, copy, screenshots, or new product documentation.

ANITKA is a Czech-market family shopping assistant covering household profiles, shopping lists, prices and promotions, store comparison, budgets, purchases/receipts, pantry, recipes/meal planning, notifications, and controlled AI/OCR utilities.

## 2. Production architecture — authoritative

Current production runs on Cloudflare Workers/OpenNext + Next.js 16.3.8 + React 19 + Neon PostgreSQL 18 + Cloudflare R2 + Neon Auth. This hosting state is based on the owner's 2026-10-17 confirmation; this documentation update did not independently inspect the live deployment.

Vercel is historical as an application hosting/deployment platform and is being removed from the project. The owner reports that the only remaining Vercel association is management of the Neon account. Do not describe Vercel as hosting production.

Cloudflare R2 stores receipt files; R2 storage and Cloudflare Workers hosting are separate responsibilities.

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
- OpenNext Cloudflare 1.20.6 for production hosting

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

The Cloudflare production deploy workflow (`.github/workflows/cloudflare-deploy.yml`) applies pending migrations before deploying the Worker. A migration therefore can apply before the new application build becomes live. New migrations must remain compatible with the currently serving code.

Required process: inspect schema/relations/indexes/constraints, create migration, test it on the test branch, merge, deploy, then verify production directly.

Migration 0055_receipt_import_purchase_index.sql added the receipt_imports.purchase_id index. It was verified as applied in production after the 2026-10-07 deployment.

## 6. Database performance rules

Database optimization must be evidence-driven. Before adding an index, inspect the real query, existing indexes, table size, pg_stat_user_tables, pg_stat_user_indexes, and query plans where useful. Consider both Neon compute and data transfer.

Do not add indexes merely because a foreign key exists. Tiny tables with sequential scans are not automatically problems. Do not make blind index additions when application workload evidence is insufficient.

Render timing: with the environment variable `PERF_TIMING=1`, the home page (`app/page.tsx`) and `getHouseholdData` write one `[perf]` JSON line per render to the server log (on Cloudflare: Worker logs). It lists every phase with its start offset and duration in ms (`session`, `householdData`, each `hh.*` query, `productPrices`, …), so overlapping phases are visible as parallel. Implemented in `lib/perf-timing.ts`; without the variable nothing is measured. A Server Component cannot set a `Server-Timing` header, which is why it goes to the log. Use it to see where a slow load really spends its time before optimizing.

Device timing (opt-in, for phones without DevTools): while `PERF_TIMING=1` is set on the server, a device that opened the app once with `?perf=1` (for example `/auth/sign-in?perf=1`; `?perf=0` turns it off) reports its own timings to `POST /api/perf` (`lib/rum-client.ts`, `lib/rum.ts`), which writes `[rum]` lines to the server log: a `load` event about 6 s after each page load (TTFB, DOMContentLoaded, FCP, LCP, main-thread blocking, transferred KB, network type, CPU cores, and the previous sign-in duration) and a `tab` event per section switch (time until its loading placeholder is gone and two frames are painted; `first` marks a first visit). The route answers 404 without `PERF_TIMING=1`, requires a signed-in user and keeps only known, bounded fields. Nothing is collected from devices that did not opt in.

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

The model-backed conversational AI Shopping Assistant remains a later phase. The signed-in app exposes a UI-only chat through the mascot button at the top left; it explicitly tells users that messages are not processed because no assistant model is connected. Do not add general agents, embeddings, recommendations, or conversational model calls without an explicit owner decision.

There are narrow approved exceptions for deterministic utility pipelines such as selected receipt/flyer extraction. Inspect the current implementation and AI/OCR documentation before changing any model, provider, or pipeline. Never assume that a historically documented model is enabled in production.

All approved LLM calls use `lib/ai/client.ts`, which sends OpenAI Responses API requests through Cloudflare's account-scoped AI REST API with `cf-aig-gateway-id` selecting the configured AI Gateway and the fixed model `openai/gpt-6-luna`. `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY_ID`, and `CLOUDFLARE_AI_GATEWAY_TOKEN` are server-side configuration; the upstream OpenAI key is stored in Cloudflare AI Gateway and is not supplied to the application. The receipt pipeline still uses its existing Google Vision/Azure OCR providers before structuring OCR text with Luna; the separate one-step receipt-image reader remains a measurement path, not production. Vision and Azure OCR are non-LLM services and remain direct provider integrations. Existing cached flyer page results are preserved and are not automatically re-read after the model switch. The previous per-pipeline Gemini/Vercel Gateway model choices are historical.

## 11. Data ingestion and catalog

Ingestion covers retailer/store data, prices, promotions/flyers, recipes, receipts, and seed/catalog data. Preserve provenance where applicable. Never invent prices, promotions, store locations, product facts, or OCR values.

Products are not identified by display name alone. Preserve brand, variant, package size, unit, normalized quantity, barcode/external references where available. Do not collapse products solely because names look similar.

## 12. UI and ANITKA visual identity

ANITKA is mobile-first. Important data-driven screens must handle loading, success, empty and error states. The top-left mascot button opens the UI-only assistant chat on mobile and desktop; it does not send user messages to an LLM, and the chat states that limitation.

For significant UI changes: use realistic local DB data, run locally, verify with Playwright, capture screenshots, inspect them visually, and keep coherent visual changes together. Do not redesign unrelated screens during backend work.

## 13. Testing

Backend/database changes require relevant unit/integration, schema/migration and authorization checks. UI changes require Playwright and realistic local DB data, with screenshot inspection for significant visual work.

For production-impacting changes, verify the actual production layer being claimed. A PR is not proof of production state. A successful deployment is not proof that a migration ran. A migration is not proof that application behavior is correct.

## 14. Git and deployment workflow

Stable branch: main.

Preferred flow: main → feature/fix branch → tests → pull request → merge → deliberate Cloudflare production deployment → post-deploy verification.

Do not make backend development changes directly on main. Cloudflare production deployments are controlled explicitly by `.github/workflows/cloudflare-deploy.yml`. The repository still contains legacy Vercel deployment configuration/workflow files; their presence is historical and does not designate them as active production deployment paths.

## 15. Production cron

Cloudflare Workers owns the current production cron execution. `vercel.json` remains the repository's schedule list used to keep the Worker triggers and routes aligned; it does not mean Vercel runs production crons. Do not arbitrarily reduce, duplicate, or move jobs without measuring Neon compute, data transfer, import correctness and downstream effects.

## 16. Cloudflare production

Cloudflare Workers/OpenNext is the current production host; Cloudflare R2 is the private receipt/object store. Staging and deployment details are documented in `docs/cloudflare-deployment.md`. Vercel references in older audit and migration documents describe historical states and are not current operating instructions. The owner reports that Vercel remains associated only with Neon account management.

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

## 20. Gradual React Native + Expo path

The current Next.js PWA stays at the repository root and remains functional. The Expo app is under `apps/mobile`; its first end-to-end feature is the household shopping list, rendered natively and backed by the existing Neon data model. It signs in through the existing Neon Auth route, stores mobile auth material in Expo SecureStore, and calls the household-scoped `/api/mobile/shopping-list` endpoints. Server-side membership checks determine the household; these endpoints reuse the same shopping-list service and validation as the PWA, with no second database or parallel list rules.

`packages/shared` remains a pnpm workspace package for browser/native-safe, platform-neutral code. Its extraction is limited to `ItemUnit`, `ITEM_UNITS`, and `unitLabel`; the PWA preserves its `lib/units` and `lib/types` APIs through re-exports. No server-side business logic has been moved into the shared package.

Do not change React, React DOM, Next.js, or pnpm versions as part of shared-package work. Keep native UI separate, and exclude server-only code, authorization, secrets, database access, and Next.js/DOM-specific modules from shared code. See `docs/02_ARCHITECTURE.md` for the audit boundary and remaining extraction candidates.
