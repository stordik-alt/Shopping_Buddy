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

## Important current technical condition
The frontend still contains mock/static data patterns. The next engineering phase is migration from prototype data to a real data-access/persistence layer.

The current `next.config.mjs` contains a TypeScript build-error bypass. This should be treated as technical debt, not a permanent solution. Do not remove it blindly; first identify and fix the underlying type errors, then re-enable strict build validation.

## Neon status
Neon is the target PostgreSQL backend and the database work has only recently started. The initial schema already contains tables for:
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
1. No assumption that every frontend feature is connected to Neon.
2. Need a documented data-access strategy.
3. Need an explicit authentication/session strategy.
4. Need row ownership/household authorization rules.
5. Need schema audit and migrations.
6. Need product/brand/variant/package/unit normalization before serious price aggregation.
7. Need explicit currency and country/locale support.
8. Need reliable price/deal history.
9. Need tests for core business rules.
10. Need to remove build/typecheck bypasses after the codebase is clean.

## Immediate task
Perform a read-only audit of the current frontend, package configuration and Neon schema. Produce a concrete backend integration plan before large implementation changes.
