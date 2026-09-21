# Shopping Buddy — Current State

## Repository
GitHub repository: `stordik-alt/Shopping_Buddy`

Current development branch: `V0/continue-frontend`

## Verified application stack
- Next.js 16.3.3
- React 19
- TypeScript 5.7.3
- Tailwind CSS 4.x
- shadcn/ui
- lucide-react
- pnpm 12.3.4
- Neon PostgreSQL 18

The repository is a Next.js/React/TypeScript application. Do not reintroduce an obsolete Python/FastAPI/SQLite architecture from earlier concepts.

## Frontend status
The repository already contains the frontend foundation and feature-stage documentation for:
- frontend stabilization
- family profile and household
- smart shopping list
- weekly shopping/meal plan
- stores and location
- prices and deals
- budget and expenses
- purchase history

These should be treated as implemented/prototype functionality until verified against current code. The presence of a UI does not prove that the feature is persisted to Neon.

**Update 2026-09-20:** Household profile, shopping list, budget/expenses and notifications are now verified persisted to Neon (see `docs/07_CHANGELOG.md`). Stores and prices/deals are now also read live from Neon (`getStores()`, `getProductPrices()` in `lib/db/queries.ts`). Meal plans: the recipe catalog (`lib/meal-plans.ts`) is, and always was, code-based reference data — there is no `recipes` table in the schema, so this is not a persistence gap. What *is* persisted now is each household's generated weekly plan (`meal_plans` table, one row per household per week, via `saveMealPlanAction`).

**Update 2026-09-20 (auth):** Authentication is wired to Neon Auth (Managed Better Auth) — email/password sign-up/sign-in, session-protected routes via `proxy.ts`, per-user household scoping (each account gets its own household on first login; the old seeded demo household still exists but is unlinked from any account), and server-side household-ownership checks on every Server Action (`lib/auth/authorize.ts`). **Verified end-to-end** against the real Neon Auth service and database: sign-up, sign-in, session-protected page load, and auto-provisioning all confirmed working (see `docs/07_CHANGELOG.md`).

**Update 2026-09-21 (shared household):** Phase B's first item — invitations/membership — is done. A household owner can generate a share link (`invitations` table + `inviteMemberAction`/`revokeInvitationAction`); the invited person joining (via sign-up or the public `/invite/[token]` landing page) becomes a `member` of that same household instead of getting their own. Verified end-to-end against the real database. "Concurrent edits" is also now addressed at a good-enough level: `AppShell` polls (`router.refresh()` every 20s + on tab focus) and resyncs its local state from the server, so another member's change shows up without a manual reload — not true real-time (no websockets), by design, to avoid new infrastructure for a freshness need this simple. Roles still stay coarse (owner/member only, no granular permissions) — open from `docs/04_ROADMAP.md` Phase B.

## Important current technical condition
Household profile, shopping list, budget/expenses, notifications, store directory, price/deal comparison, and each household's generated weekly meal plan now read from (and, except stores/prices, write to) Neon via `lib/db/queries.ts` and `app/actions/`. The meal-plan *recipe catalog* itself (`lib/meal-plans.ts`) remains code-based reference data by design — there's no `recipes` table to migrate it to.

~~The current `next.config.mjs` contains a TypeScript build-error bypass.~~ Removed 2026-09-21: `tsc --noEmit` had been passing clean throughout this project's recent work, and the production incident the same day (see `docs/07_CHANGELOG.md`) was a concrete demonstration of the bypass shipping a real arity error to production. `next build` now runs its own TypeScript validation for real (confirmed: build log shows `Running TypeScript ... Finished TypeScript` instead of `Skipping validation of types`) and passes clean.

## Neon status
Neon is provisioned (Vercel Marketplace, resource `neon-cyclamen-bridge` on project `storek/shopping-buddy`) and the schema below is live and seeded, verified 2026-09-20. It contains tables for:
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

There is also a `neon_auth` schema — this is Neon Auth (Managed Better Auth). It is now the identity source of truth (see auth update above); `public.users` was dropped and `household_members.user_id` references `neon_auth."user"(id)` instead.

## Current gaps to resolve
1. ~~Store directory, price comparison and meal-plan recipes are not yet connected to Neon.~~ Store directory and price/deal comparison done, and household meal plans now persist (see `docs/07_CHANGELOG.md`). The recipe catalog itself intentionally stays code-based (`lib/meal-plans.ts`) — there's no `recipes` table, so this was never a real gap once verified.
2. ~~Need a documented data-access strategy.~~ Done: `lib/db/queries.ts` (reads) + `app/actions/*` (Server Action writes), using Drizzle ORM.
3. ~~Need an explicit authentication/session strategy.~~ Done: wired to Neon Auth and verified end-to-end (see auth update above).
4. ~~Need row ownership/household authorization rules.~~ Done: `lib/auth/authorize.ts` (`requireHouseholdId()`) plus per-action ownership checks in `app/actions/*` (see `docs/07_CHANGELOG.md`).
5. ~~Need schema audit and migrations tooling beyond `drizzle-kit push`.~~ Done: established a `drizzle-kit generate` baseline (`lib/db/migrations/0000_baseline_snapshot.sql`, generated from the schema as it stood after the earlier hand-written migrations — those are now superseded/retired from disk, staying in git history and `docs/07_CHANGELOG.md` for the record) and applied via the same minimal runner as before (`lib/db/migrate.ts`, `pnpm db:migrate`). Workflow going forward: edit `lib/db/schema.ts` → `pnpm db:generate` → review the generated SQL → `pnpm db:migrate`. Verified end-to-end with a real change (two missing indexes on hot-path columns). Along the way, found and fixed a real bug in the runner: it only split migration files on `;\n`, but `drizzle-kit generate`'s default Postgres output separates statements with a literal `--> statement-breakpoint` line instead — the runner now handles both.
6. Need product/brand/variant/package/unit normalization before serious price aggregation.
7. ~~Need explicit currency and country/locale support.~~ Partially done: `households.currency`, `prices.currency`, `deals.currency` added (ISO 4217, default `CZK`) — closes `docs/03_DATABASE.md` rule 9, which was previously violated (no money column anywhere had a currency). Not done: the UI never reads or displays these — `lib/format.ts`'s `money()` is still hardcoded to `Kč`/`cs-CZ`, deliberately not changed since there's no real multi-currency UI need yet (`docs/02_ARCHITECTURE.md`: "Do not prematurely internationalize every UI string"). Country/locale beyond this (store `country` already existed) still open.
8. Need reliable price/deal history (schema supports it; not yet exercised by real price updates over time).
9. ~~Need tests for core business rules.~~ Started: `vitest` (`pnpm test`) with unit tests for `lib/budget.ts`, `lib/prices.ts`, `lib/meal-plans.ts` (including the allergen-filtering safety property and a regression test for the `currentWeekStart` timezone bug fixed earlier), and `lib/geo.ts` — see `docs/07_CHANGELOG.md`. Coverage is not exhaustive; Server Actions and the auto-provision/auto-join logic in `lib/db/queries.ts` still have no automated tests (would need a test database or mocking, not attempted here).
10. ~~Need to remove build/typecheck bypasses after the codebase is clean.~~ Done — `next.config.mjs`'s `typescript.ignoreBuildErrors` removed (see above).

## Immediate task
Perform a read-only audit of the current frontend, package configuration and Neon schema. Produce a concrete backend integration plan before large implementation changes.
