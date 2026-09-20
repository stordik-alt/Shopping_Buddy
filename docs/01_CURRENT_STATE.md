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

## Important current technical condition
Household profile, shopping list, budget/expenses, notifications, store directory, price/deal comparison, and each household's generated weekly meal plan now read from (and, except stores/prices, write to) Neon via `lib/db/queries.ts` and `app/actions/`. The meal-plan *recipe catalog* itself (`lib/meal-plans.ts`) remains code-based reference data by design — there's no `recipes` table to migrate it to.

The current `next.config.mjs` contains a TypeScript build-error bypass. This should be treated as technical debt, not a permanent solution. Do not remove it blindly; first identify and fix the underlying type errors, then re-enable strict build validation.

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

There is also a `neon_auth` schema — this is Neon Auth (Managed Better Auth). It is now the identity source of truth (see auth update above); `public.users` was dropped and `household_members.user_id` references `neon_auth."user"(id)` instead.

## Current gaps to resolve
1. ~~Store directory, price comparison and meal-plan recipes are not yet connected to Neon.~~ Store directory and price/deal comparison done, and household meal plans now persist (see `docs/07_CHANGELOG.md`). The recipe catalog itself intentionally stays code-based (`lib/meal-plans.ts`) — there's no `recipes` table, so this was never a real gap once verified.
2. ~~Need a documented data-access strategy.~~ Done: `lib/db/queries.ts` (reads) + `app/actions/*` (Server Action writes), using Drizzle ORM.
3. ~~Need an explicit authentication/session strategy.~~ Done: wired to Neon Auth and verified end-to-end (see auth update above).
4. ~~Need row ownership/household authorization rules.~~ Done: `lib/auth/authorize.ts` (`requireHouseholdId()`) plus per-action ownership checks in `app/actions/*` (see `docs/07_CHANGELOG.md`).
5. Need schema audit and migrations tooling beyond `drizzle-kit push`. Partially started: `lib/db/migrations/0001_neon_auth_integration.sql` is the first tracked, hand-written migration, applied via a minimal runner (`lib/db/migrate.ts`, `pnpm db:migrate`) rather than `drizzle-kit generate`/`migrate` — the schema had no prior migration history for `generate` to build a baseline from. Adopting the full `drizzle-kit generate`/`migrate` workflow end-to-end is still open.
6. Need product/brand/variant/package/unit normalization before serious price aggregation.
7. Need explicit currency and country/locale support.
8. Need reliable price/deal history (schema supports it; not yet exercised by real price updates over time).
9. Need tests for core business rules.
10. Need to remove build/typecheck bypasses after the codebase is clean.

## Immediate task
Perform a read-only audit of the current frontend, package configuration and Neon schema. Produce a concrete backend integration plan before large implementation changes.
