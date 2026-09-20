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

**Update 2026-09-20:** Household profile, shopping list, budget/expenses and notifications are now verified persisted to Neon (see `docs/07_CHANGELOG.md`). Stores, prices/deals and meal-plan recipes are seeded into Neon but the UI still reads them from `lib/mock-data.ts` / `lib/prices.ts` / `lib/meal-plans.ts` — not yet wired to live queries.

## Important current technical condition
Household profile, shopping list, budget/expenses and notifications now read from and write to Neon via `lib/db/queries.ts` and `app/actions/`. The store directory, price comparison and meal-plan recipe catalog still use mock/static data — that migration is not done.

The current `next.config.mjs` contains a TypeScript build-error bypass. This should be treated as technical debt, not a permanent solution. Do not remove it blindly; first identify and fix the underlying type errors, then re-enable strict build validation.

## Neon status
Neon is provisioned (Vercel Marketplace, resource `neon-cyclamen-bridge` on project `storek/shopping-buddy`) and the schema below is live and seeded, verified 2026-09-20. It contains tables for:
- users
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

There is also a `neon_auth` schema. Before implementing authentication, inspect the actual Neon Auth configuration and decide whether to use it rather than duplicating authentication tables/logic.

## Current gaps to resolve
1. Store directory, price comparison and meal-plan recipes are not yet connected to Neon (seeded but read from code constants).
2. ~~Need a documented data-access strategy.~~ Done: `lib/db/queries.ts` (reads) + `app/actions/*` (Server Action writes), using Drizzle ORM.
3. **Need an explicit authentication/session strategy — highest-priority remaining gap.** All reads/writes currently operate against a single seeded household with no login and no access control. Inspect the `neon_auth` schema before building a separate system.
4. Need row ownership/household authorization rules (depends on 3).
5. Need schema audit and migrations tooling beyond `drizzle-kit push` (no migration history is tracked yet — every change so far went through `push`, not a generated migration file).
6. Need product/brand/variant/package/unit normalization before serious price aggregation.
7. Need explicit currency and country/locale support.
8. Need reliable price/deal history (schema supports it; not yet exercised by real price updates over time).
9. Need tests for core business rules.
10. Need to remove build/typecheck bypasses after the codebase is clean.

## Immediate task
Perform a read-only audit of the current frontend, package configuration and Neon schema. Produce a concrete backend integration plan before large implementation changes.
