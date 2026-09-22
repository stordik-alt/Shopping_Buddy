# Shopping Buddy — Neon Database Rules

## Database
Neon PostgreSQL 18 is the persistent database.

The initial schema already contains:
`users`, `households`, `household_members`, `profiles`, `children`, `preferences`, `product_categories`, `products`, `stores`, `store_locations`, `prices`, `deals`, `shopping_lists`, `shopping_list_items`, `budgets`, `expenses`, `purchases`, `purchase_items`, `meal_plans`, `notifications`, `pantry_items`, `receipt_imports`.

There is also a `neon_auth` schema.

## Rules
1. Treat the actual Neon schema as authoritative after verification.
2. Never assume the initial schema is final.
3. Before altering a table, inspect columns, types, nullability, defaults, indexes and constraints.
4. Before changing relationships, inspect foreign keys.
5. Use migrations for schema changes.
6. Never silently drop or truncate production data.
7. Prefer UUID identifiers where the existing schema uses them consistently.
8. Store monetary values using exact numeric/decimal database types, not floating point.
9. Prices must have explicit currency.
10. Time-sensitive prices/deals need effective/valid dates.
11. Product identity must eventually distinguish product/brand/variant/package/unit where required for correct price comparison.
12. Historical purchase records must remain stable even if a current product or price later changes.
13. Household access must be enforced server-side.
14. Multi-table writes that represent one user action should use a transaction.

## Authentication
The `neon_auth` schema exists. Inspect it before implementing auth. Avoid building a second independent authentication system unless there is a verified requirement.

## Data migration strategy
Migration order should generally be:
1. audit existing schema
2. fix/extend schema
3. add typed data-access layer
4. connect one feature at a time
5. migrate/seed required reference data
6. remove mock usage only after real persistence works
7. validate existing user flows
