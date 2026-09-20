# Shopping Buddy — Change Log

## 2026-09-20
### Neon schema, data-access layer, and first real persistence
- Provisioned Neon PostgreSQL through the Vercel Marketplace integration (`storek/shopping-buddy`, resource `neon-cyclamen-bridge`) and linked it as `DATABASE_URL` / `DATABASE_URL_UNPOOLED`.
- Added the full relational schema in `lib/db/schema.ts` (Drizzle ORM) covering every entity listed in the roadmap: `users`, `households`, `household_members`, `profiles`, `children`, `preferences`, `product_categories`, `products`, `stores`, `store_locations`, `prices`, `deals`, `shopping_lists`, `shopping_list_items`, `purchases`, `purchase_items`, `budgets`, `expenses`, `meal_plans`, `notifications`. Applied with `drizzle-kit push` against the direct (unpooled) connection.
- Seeded the schema from the existing prototype fixtures (`lib/mock-data.ts`, `lib/prices.ts`) via `lib/db/seed.ts` — one household, two members with profiles, two children, household preferences, 6 store chains/locations, 10 products, prices/deals, a shopping list with items, 6 purchase-history records, 6 expenses, and 3 notifications.
- Added a typed read layer (`lib/db/queries.ts` → `getHouseholdData()`) and Server Actions (`app/actions/{shopping,household,budget,notifications}.ts`) for mutations.
- Converted `app/page.tsx` into an async Server Component (`export const dynamic = 'force-dynamic'`) that fetches from Neon on every request; all interactive state moved into a new client component, `components/app-shell.tsx`.
- Migrated the following domains from local mock state to real Neon persistence, verified end-to-end (UI action → Server Action → Postgres row, checked directly via SQL): household profile (name, budget, members, children, preferences), shopping list items (add/update/toggle/remove, new shopping lists), expenses, and notification read state.
- Not yet migrated to live reads/writes: store directory, price comparison, and meal-plan recipe catalog remain reference/catalog data sourced from `lib/mock-data.ts` / `lib/prices.ts` / `lib/meal-plans.ts` (already seeded into Neon for future use, but the UI doesn't query them yet).
- Item/notification/expense/member/child/purchase-record identifiers changed from client-generated numbers to Neon-generated UUID strings (`lib/types.ts`).
- **No authentication/session strategy implemented yet.** Per `docs/04_ROADMAP.md` Phase A, this is the next item before household/user-scoped authorization can be enforced server-side — right now all data reads/writes operate against a single seeded household with no access control.
- `next.config.mjs` still has `typescript.ignoreBuildErrors: true` (pre-existing from the v0.app template) — not removed in this change; `npx tsc --noEmit` was used for real type-error verification instead.

### Documentation foundation for Claude Code
- Added `CLAUDE.md` as the concise persistent project instruction file.
- Added current project context, verified stack/current-state guidance, architecture, Neon database rules, roadmap, business rules and AI rules.
- Kept the existing 01–15 feature-stage documents as historical/feature context rather than deleting them.
- Updated the project direction: the next major phase is reliable Neon persistence and backend integration, not a frontend rewrite.
- Confirmed the application stack is Next.js + React + TypeScript + Tailwind/shadcn + pnpm.
- Confirmed Neon PostgreSQL is the target persistent database.

## Documentation rule
Every future architectural/schema/business-rule change should append a dated entry here. Keep entries concise and factual.
