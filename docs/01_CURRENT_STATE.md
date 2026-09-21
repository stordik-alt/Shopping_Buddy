# Shopping Buddy — Current State

**Repository:** `stordik-alt/Shopping_Buddy`
**Stable branch:** `main`
**Current backend development branch:** `v0/backend`
**Previous frontend branch:** `V0/continue-frontend` — historical/obsolete unless explicitly requested
**Last updated:** 2026-09-21

---

# 1. Project Overview

Shopping Buddy is a family shopping assistant focused initially on the Czech market.

The application combines:

* household management
* family profiles
* shopping lists
* product catalog
* store directory
* prices
* promotions
* meal planning
* budgets
* expenses
* purchase history
* shopping optimization
* notifications
* shared household functionality

The long-term goal is to provide intelligent shopping assistance based on reliable household, product, price and purchase data.

The AI Shopping Assistant is intentionally planned as the final major development phase.

---

# 2. Current Git State

## Stable branch

```text
main
```

`main` is the stable project branch.

## Current backend development

```text
v0/backend
```

Backend development should be performed on this branch.

The branch should be based on the latest stable `main`.

Development flow:

```text
main
  ↓
v0/backend
  ↓
development
  ↓
testing / validation
  ↓
pull request
  ↓
main
```

## Historical branch

```text
V0/continue-frontend
```

This branch was used during the earlier frontend-development phase.

It is no longer the active development branch.

Do not use it for new backend development unless explicitly requested.

---

# 3. Technology Stack

Current application stack:

* Next.js 16.3.3
* React 19
* TypeScript 5.7.3
* Tailwind CSS 4.x
* shadcn/ui
* lucide-react
* pnpm 12.3.4
* Neon PostgreSQL 18
* Drizzle ORM
* Neon Auth

The application uses Next.js as the application/backend framework.

There is no separate Python/FastAPI backend.

SQLite is not used as the production database.

---

# 4. Frontend Status

The original frontend prototype has been substantially connected to persistent backend functionality.

The UI remains mobile-first and responsive.

The frontend currently contains functionality for areas including:

* dashboard
* household/profile
* shopping lists
* budget
* expenses
* stores
* prices
* promotions
* meal plans
* notifications
* shared household functionality

Existing UI should be preserved when working on backend functionality unless a UI change is required.

---

# 5. Authentication

Authentication is implemented using Neon Auth.

Current behavior includes:

* email/password authentication
* protected application routes
* authenticated session handling
* server-side user identification
* household-level authorization

Protected routes are handled through the existing Next.js proxy/authentication flow.

The application must not trust client-provided user or household identifiers for authorization decisions.

---

# 6. Household Model

Household functionality is implemented.

The application supports:

* household creation
* household profile
* household members
* adults
* children
* household preferences
* household-scoped data

Database operations are scoped to the authenticated household.

Important household-related data includes:

* profiles
* children
* preferences
* shopping lists
* budgets
* expenses
* purchases
* meal plans
* notifications

---

# 7. Shared Household

Shared household functionality has been implemented.

Current functionality includes:

* household invitations
* membership records
* invitation links
* joining an existing household
* owner/member roles

The current synchronization approach uses lightweight refresh/polling rather than websocket infrastructure.

The application currently uses:

* periodic refresh
* tab-focus refresh

This is considered sufficient for the current development stage.

Realtime websocket infrastructure should not be introduced unless a concrete requirement appears.

---

# 8. Database

The production database is:

```text
Neon PostgreSQL
```

Database access is handled through:

```text
Drizzle ORM
```

The database contains the main application domains.

Current schema includes tables/entities for:

* households
* household_members
* profiles
* children
* preferences
* product_categories
* products
* stores
* store_locations
* prices
* deals
* shopping_lists
* shopping_list_items
* budgets
* expenses
* purchases
* purchase_items
* meal_plans
* notifications
* invitations

Neon Auth also maintains its own authentication-related schema.

The obsolete `public.users` application table has been removed.

---

# 9. Database Migrations

Migration tooling is implemented.

The project uses Drizzle migrations.

The current baseline migration was generated using:

```text
drizzle-kit generate
```

Baseline migration:

```text
lib/db/migrations/0000_baseline_snapshot.sql
```

Migration runner:

```text
lib/db/migrate.ts
```

Migration command:

```bash
pnpm db:migrate
```

The migration runner supports the project's migration statement-breakpoint format.

Database schema changes should always be accompanied by appropriate migrations.

---

# 10. Store Directory

Store directory functionality is implemented.

Initial supported Czech store chains include:

* Lidl
* Albert
* Kaufland
* Billa
* JIP
* Penny

The store model distinguishes between:

```text
Store chain
    ↓
Store location
```

Real store locations have been added to the database.

The current database contains approximately:

```text
55 store locations
```

covering multiple Czech cities and regions.

The store directory was expanded using real geographic/store data.

Fabricated store locations must not be added.

---

# 11. Geographic Store Data

Store locations can contain geographic information.

The application supports location-aware functionality for store discovery and shopping optimization.

Recent work included:

* GPS/manual location handling
* store location filtering
* nationwide store directory expansion
* distance-aware shopping logic

The application should remain functional when precise GPS information is unavailable.

Manual location selection should remain supported.

---

# 12. Products

Product data is persisted in Neon.

The product model is intended to support:

* product identity
* category
* brand
* variant
* package size
* unit
* normalized quantity
* barcode/external identifier where available

Product normalization is still an important area of ongoing development.

Before serious price aggregation and comparison, products from different sources must be mapped to stable internal product identities.

Product display names alone must not be treated as reliable unique identifiers.

---

# 13. Prices

Price data is persisted in Neon.

The current application can read product prices from the database.

Existing frontend code has been connected to database-backed price retrieval.

The application must distinguish between:

```text
current price
```

and:

```text
historical price
```

**Update 2026-09-21:** The append-only mechanism for real price history now exists — `lib/db/queries.ts`'s `recordPriceObservation()` inserts a new dated row rather than overwriting, and `getProductPrices()` now surfaces each store's full observation history (not just the latest) to the domain layer. Not yet exercised in practice: no ingestion/refresh source calls it, so every real product still has exactly one observation. See section 22 for how this is consumed.

Price records include currency information.

The default application currency is:

```text
CZK
```

---

# 14. Promotions / Deals

Promotion/deal data is persisted in Neon.

The frontend can read deal information from the database.

Promotion logic has been expanded to consider factors such as:

* discount
* price
* unit price
* promotion quality
* product relevance
* shopping constraints

The system must not assume that every advertised percentage discount represents a genuinely good deal.

Reliable historical promotion data remains an area for further development.

---

# 15. Internet Price and Promotion Data

A major next-stage objective is connecting Shopping Buddy to external price and promotion sources.

The preferred architecture is:

```text
External retailer/source
        ↓
Fetcher / connector
        ↓
Normalizer
        ↓
Validator
        ↓
Database
        ↓
Price / promotion logic
        ↓
Shopping Buddy
```

Potential data sources include:

* official retailer APIs
* official feeds
* public retailer data
* permitted public websites
* permitted third-party data providers

The application must not bypass:

* CAPTCHA
* authentication
* access controls
* technical restrictions
* other mechanisms designed to restrict access

The application must never invent price or promotion data.

Imported data should retain source and timestamp information wherever available.

---

# 16. Currency

Currency support has been partially implemented.

The database includes currency fields for:

* households
* prices
* deals

Default currency:

```text
CZK
```

The current UI still contains some Czech-specific formatting assumptions.

A more complete localization/currency abstraction remains to be implemented before international rollout.

---

# 17. Shopping Lists

Shopping lists are persisted in Neon.

The application supports database-backed shopping-list data.

Shopping-list items can contain product and quantity information.

The long-term shopping-list model should support:

* quantities
* units
* product references
* completion state
* optional store association
* optional prices
* notes

The shopping-list domain should remain deterministic and database-backed.

---

# 18. Budget and Expenses

Budget functionality is implemented using Neon persistence.

Current functionality includes:

* budget records
* expense records
* remaining budget calculation
* percentage-used calculation
* budget threshold notifications

Budget threshold behavior currently includes important thresholds such as:

```text
80%
100%
```

Budget calculations are implemented as application logic rather than being dependent exclusively on the UI.

Recent work added notification behavior when spending crosses configured thresholds.

---

# 19. Notifications

Notifications are persisted in the database.

Current notification functionality (2026-09-21) covers all four Phase 8 events. Each is a
deterministic generator wired into the Server Action (or, for reminders, the cron route) for the
triggering event:

* **budget thresholds** — `lib/budget.ts`'s `crossedBudgetThreshold()`, wired into `addExpenseAction`. Fires once when spending crosses 80% or 100% of the household's monthly budget; does not re-fire while already in the same band.
* **important promotions (price/deal alerts)** — `lib/prices.ts`'s `assessDealQuality()`, wired into `addShoppingItemAction`. Fires when a product just added to the list has a currently active deal that is genuinely the best price for it across known stores, not merely any discount.
* **shopping reminders** — the only event that isn't triggered by a user action. `app/api/cron/shopping-reminders`, a daily Vercel Cron job (`vercel.json`), finds undone list items that have sat around at least `STALE_AFTER_DAYS` (3) using the pure `lib/reminders.ts`'s `findStaleItems()`, and reminds the household once per stale item. **`CRON_SECRET` is not yet set in the Vercel project's environment variables** — until it is, this route accepts unauthenticated requests (see `docs/07_CHANGELOG.md`).
* **household events** — `lib/db/queries.ts`'s exported `joinHouseholdViaInvitation()` notifies the household when someone joins via invitation. Shared by both places a join can happen (auto-join on first login, and the explicit `acceptInvitationAction` from `/invite/[token]`) — those two paths had duplicated the join mechanics before this, now consolidated into one function.

Notifications should use deterministic rules wherever possible.

AI should not be introduced simply to perform deterministic notification logic.

---

# 20. Meal Plans

Meal-plan functionality is partially implemented.

The existing recipe catalog remains code-based by design.

Generated weekly meal plans are persisted in:

```text
meal_plans
```

Meal planning is intended to integrate with:

* household members
* preferences
* children
* exclusions
* shopping lists
* budget
* products

The meal-plan domain should not be duplicated by creating another independent recipe/meal system.

---

# 21. Purchase History

Purchase-related database structures exist.

The purchase model includes:

* purchases
* purchase items

Purchase history is intended to support future functionality such as:

* spending analysis
* frequently purchased products
* recurring purchases
* price trends
* consumption patterns
* shopping optimization

This area remains less mature than the core shopping-list and budget functionality.

---

# 22. Smart Shopping Engine

A Smart Shopping Engine has been started.

Current logic considers factors such as:

* trip distance
* promotion quality
* budget constraints
* store comparison
* unit price
* historical prices — `lib/prices.ts`'s `isHistoricLow()`, foundation done 2026-09-21 (see section 13); flags a deal as a genuine all-time low rather than just today's discount, but has no real historical data to act on yet since nothing populates price history in production

The engine is intended to optimize the overall shopping trip rather than simply find the cheapest individual item.

Future improvements should include:

* number of stores visited
* travel cost
* household preferences
* product availability
* required quantities
* stock/storage constraints
* bulk-buy recommendations
* purchase patterns

The optimization logic must remain deterministic and testable.

---

# 23. Testing

Automated testing has been started.

Tests currently cover areas including:

* budget
* prices
* meal plans
* geographic/store logic

Further tests are still required for:

* server actions
* authentication
* household authorization
* auto-provisioning
* invitation/join flows
* price ingestion
* promotion normalization
* shopping optimization

Critical business logic should receive regression tests when bugs are fixed.

---

# 24. TypeScript / Build

The previous TypeScript build-error bypass has been removed.

The project should compile against the actual TypeScript errors.

Do not introduce configuration that hides genuine TypeScript errors simply to make deployment pass.

Before considering a feature complete, validate the relevant:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

commands that are actually available in the project.

---

# 25. Current Backend Priorities

The current backend development branch is:

```text
v0/backend
```

The recommended order of work is:

### Phase 1 — Backend foundation

* audit current backend
* stabilize data access
* stabilize authorization
* improve database integrity
* improve tests
* improve error handling

### Phase 2 — Core household functionality

* household/profile
* members
* children
* preferences
* shared household

### Phase 3 — Shopping

* shopping lists
* products
* product normalization
* quantities/units

### Phase 4 — Financial data

* budgets
* expenses
* purchase history

### Phase 5 — Prices and promotions

* product normalization
* external data ingestion
* price history
* promotion history
* unit-price comparison
* retailer connectors

### Phase 6 — Meal planning

* meal plans
* shopping-list integration
* budget integration

### Phase 7 — Optimization

* store comparison
* distance
* travel cost
* promotion quality
* household constraints

### Phase 8 — Notifications

* budget alerts
* price/deal alerts
* reminders
* household events

### Phase 9 — Internationalization

* currencies
* localization
* international store architecture
* country-specific data providers

### Phase 10 — AI

AI Shopping Assistant is the final major phase.

---

# 26. AI Status

AI functionality is intentionally deferred.

The project should not currently add:

* Vercel AI SDK
* AI Gateway
* LLM provider integrations
* model API calls
* AI agents
* embeddings

until the underlying application data is sufficiently reliable.

The AI assistant should eventually operate on:

* household data
* preferences
* shopping lists
* products
* prices
* promotions
* budgets
* purchase history
* meal plans
* store information
* optimization results

AI should be an additional intelligence layer on top of a reliable deterministic system.

---

# 27. Current Known Gaps

The following areas remain open or incomplete.

## Product normalization

Need stronger mapping of:

* product
* brand
* variant
* package
* unit
* barcode
* external product identifiers

## Price history

The append-only recording mechanism and the domain logic that consumes it both exist (`recordPriceObservation()`, `isHistoricLow()` — see section 13). Still needed: something that actually calls it. No price-refresh/ingestion source is wired up, so no real product has more than one observation yet.

## Promotion history

Need reliable historical tracking of promotions. Unlike prices, `deals` has no append-only observation mechanism yet — only current `valid_from`/`valid_until`.

## External price ingestion

Need production-ready retailer connectors and ingestion jobs.

## Currency/localization

Database foundation exists, but UI and domain-wide localization still require work.

## Server action tests

More automated coverage is required.

## Authorization tests

Household-level access control requires broader automated coverage.

## Purchase analytics

Purchase history exists but deeper analytics are still required.

## International rollout

The Czech implementation is the primary target.

International support is planned later.

## Cron authorization

`app/api/cron/shopping-reminders` checks its `Authorization` header against `process.env.CRON_SECRET`, but that variable is not yet set in the Vercel project. Needs to be added in the Vercel dashboard before the route can be trusted in production.

---

# 28. Recent Completed Work

Recent development has included:

* Neon persistence for household/profile data
* shopping-list persistence
* budget persistence
* expense persistence
* notification persistence
* database-backed stores
* database-backed prices
* database-backed deals
* meal-plan persistence
* Neon Auth integration
* protected routes
* household authorization
* household invitations
* shared household membership
* owner/member roles
* concurrent-edit refresh strategy
* nationwide store directory expansion
* GPS/manual location handling
* Smart Shopping Engine foundations
* budget threshold notifications
* price/deal alert notifications
* time-scheduled shopping-reminder notifications (Vercel Cron)
* household-join event notifications (Phase 8 now fully complete: budget/deal/reminder/household-event notifications)
* price-history foundation: append-only observation recording + historic-low detection (not yet fed by a real ingestion source)
* currency fields
* migration baseline
* automated tests for selected domains
* removal of the TypeScript build-error bypass

---

# 29. Important Development Constraints

When continuing development:

1. Do not create a second backend.
2. Do not reintroduce Python/FastAPI.
3. Do not replace Neon/PostgreSQL with SQLite.
4. Do not replace Drizzle without a concrete reason.
5. Do not bypass authentication.
6. Do not bypass household authorization.
7. Do not invent price or promotion data.
8. Do not create fake store locations.
9. Do not duplicate existing domain logic.
10. Do not introduce AI before the final phase.
11. Do not make critical calculations only in the UI.
12. Do not modify unrelated working UI during backend work.
13. Do not add unnecessary dependencies.
14. Do not hide TypeScript/build errors.
15. Do not commit secrets.

---

# 30. Documentation Workflow

When a significant feature is completed:

Update:

```text
docs/01_CURRENT_STATE.md
docs/07_CHANGELOG.md
```

When architecture changes:

```text
docs/02_ARCHITECTURE.md
```

When database structure changes:

```text
docs/03_DATABASE.md
```

When roadmap priorities change:

```text
docs/04_ROADMAP.md
```

When business rules change:

```text
docs/05_BUSINESS_RULES.md
```

When AI rules change:

```text
docs/06_AI_RULES.md
```

Documentation must reflect the actual implementation.

---

# 31. Current Definition of Done

A feature should be considered complete only when appropriate:

* implementation exists
* TypeScript is correct
* database persistence works
* authorization works
* business logic is deterministic
* loading state works
* error state works
* empty state works
* mobile layout works
* tests exist where appropriate
* no obvious regression exists
* relevant documentation is updated
* changelog is updated

The application should remain stable while functionality is expanded incrementally.

---

# 32. Current Development Principle

The current priority is not to add the largest number of features as quickly as possible.

The priority is to build a reliable foundation:

```text
Reliable data
      ↓
Reliable backend
      ↓
Reliable business logic
      ↓
Reliable shopping optimization
      ↓
Useful automation
      ↓
AI assistance
```

AI should not compensate for missing or unreliable application foundations.

The current focus is therefore the backend and data layer on:

```text
v0/backend
```
