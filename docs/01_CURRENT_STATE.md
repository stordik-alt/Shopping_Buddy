# Shopping Buddy — Current State

**Repository:** `stordik-alt/Shopping_Buddy`
**Stable branch:** `main`
**Current backend development branch:** `v0/backend`
**Previous frontend branch:** `V0/continue-frontend` — historical/obsolete unless explicitly requested
**Last updated:** 2026-09-22

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

**Update 2026-09-21:** Found that this rule was actually being violated — `shoppingListItems.productId` and `purchaseItems.productId` have existed in the schema since early on, but no code ever populated or read either one; the whole app instead matched a shopping-list item to catalog data via exact string equality on its free-text name (`item.name === product.productName`), case-sensitively, with no autocomplete/picker UI to keep the typed text aligned with the catalog. First fix: `addShoppingItemAction` now resolves the typed name to a real product via `lib/products.ts`'s `matchProductByName()` (case/whitespace-insensitive, no fuzzy/typo tolerance — a match is exact or it doesn't happen) and stores the real `productId` on insert; the deal-alert check also now matches on the resolved canonical catalog name rather than the raw typed one, so a differently-cased entry no longer silently misses a real deal. Second: the shopping-list input now offers native browser autocomplete (`<datalist>`) against the real catalog, so a suggestion can be picked instead of relying on exact free-text typing — verified in a real browser session (see section 22). `purchaseItems.productId` is still unused — there's no Server Action that writes a real purchase record yet at all (separate, larger gap; see section 21). Brand/variant/package-size/barcode columns are still not modeled — deliberately deferred until there's a reliable name→product link to attach them to, which is what this closes.

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
* **shopping reminders** — the only event that isn't triggered by a user action. `app/api/cron/shopping-reminders`, a daily Vercel Cron job (`vercel.json`), finds undone list items that have sat around at least `STALE_AFTER_DAYS` (3) using the pure `lib/reminders.ts`'s `findStaleItems()`, and reminds the household once per stale item. Fully live in production since 2026-09-21 — see section 27 "Cron authorization".
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

**Update 2026-09-22:** Generation is now optionally stock-aware (uses the household pantry to favor recipes it can partly make from what's already at home), individual meals can be regenerated one at a time, and a meal can be marked cooked to deduct its ingredients from the pantry. See section 33.

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

**Update 2026-09-21:** Found this was more than "less mature" — no Server Action ever wrote a real purchase; `purchases`/`purchase_items` were seeded once and read-only ever since (the analytics in `lib/purchase-history.ts` and `components/budget/purchase-history.tsx` were real, just fed frozen data). Added `app/actions/purchases.ts`'s `completePurchaseAction(listId)`, triggered by a new "Dokončit nákup" button next to the shopping list's existing "Vymazat hotové" (the two now coexist: one just discards done items, the other turns them into real purchase history). It groups the list's done items by preferred store (items with none share one purchase with no store — a real case, not an error) and creates one `purchases` row + its `purchase_items` per group, then removes those items from the list. Found and fixed a related bug while wiring this up: `getHouseholdData()` was defaulting a purchase's store to `'Lidl'` whenever `storeLocationId` was null (`purchase.storeLocation?.store.chain ?? 'Lidl'`) — silently inventing data. `PurchaseRecord.store` is now correctly optional, matching the schema's real nullability, and the UI shows "Neurčený obchod" instead. Verified in a real browser against the real dev database: added a real catalog item, marked it done, clicked "Dokončit nákup", confirmed the item left the shopping list and a real purchase appeared in the budget tab's history with the correct date, store fallback text, and "Nejčastěji kupované" analytics update. The item's `price` in the resulting purchase reflects `shoppingListItems.price` (the item's own stored price field, same as `plannedSpend()` already uses for budget planning) — not the live catalog price shown via `productPrices`, which is a separate, pre-existing gap (nothing has ever synced these two) rather than something new. `purchaseItems.productId` is now actually populated too, inherited from the shopping-list item's own `productId` (see section 12).

**Update 2026-09-22:** A second write path now exists alongside `completePurchaseAction`: `app/actions/receipts.ts`'s `importReceiptAction()` turns manually-entered receipt line items into a real purchase (plus pantry restocking), with the OCR-extraction step deliberately stubbed for later. See section 33.

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
* prices (including historic-low detection)
* meal plans
* geographic/store logic
* shopping reminders (staleness logic)
* every Server Action in `app/actions/` and their household-scoping/role checks, against the real dev database (`app/actions/*.test.ts`)
* invitation/join-via-invitation logic and its notification, against the real dev database (`lib/db/queries.test.ts`)

Further tests are still required for:

* full session/cookie-level authentication (would need e2e testing, not attempted)
* auto-provisioning (new-household-on-first-login path inside `getHouseholdData()`, as opposed to the invitation-join path which is now covered)
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

The real productId link from a shopping-list item to the catalog now exists and is populated (see section 12) — previously dead schema. Done since (2026-09-21): the shopping-list input now has native browser autocomplete (`<datalist>`) against the real catalog (`components/shopping/shopping-list.tsx`), so typed text has a real chance of matching instead of relying on the user to type it exactly. Still free text underneath — nothing is enforced, picking a suggestion is optional. Verified end-to-end in a real headless-browser session against the real dev database: signed up a fresh test account, confirmed the datalist's options matched the live catalog, added an item by picking a differently-cased suggestion, and confirmed both the item appeared correctly in the UI and its `productId` was set to the right product in the database. Still needed, in roughly this order:

* stronger mapping of: brand, variant, package size, unit, barcode, external product identifiers — deliberately not modeled yet; there's no real catalog data with more than one package size per product to design or verify this against
* wiring `purchaseItems.productId`, which stays unused until a real "record a purchase" write path exists (see "Purchase analytics" below)

## Price history

The append-only recording mechanism and the domain logic that consumes it both exist (`recordPriceObservation()`, `isHistoricLow()` — see section 13). Still needed: something that actually calls it. No price-refresh/ingestion source is wired up, so no real product has more than one observation yet.

## Promotion history

Need reliable historical tracking of promotions. Unlike prices, `deals` has no append-only observation mechanism yet — only current `valid_from`/`valid_until`.

## External price ingestion

Need production-ready retailer connectors and ingestion jobs.

## Currency/localization

Database foundation exists, but UI and domain-wide localization still require work.

## Server action tests

Started 2026-09-21, now covers every file in `app/actions/`: `shopping.test.ts`, `household.test.ts`, `budget.test.ts`, `notifications.test.ts`, `meal-plan.test.ts`, all as integration tests against the real dev database. `requireHouseholdId()`/`requireHousehold()` and `next/cache`'s `revalidatePath()` are mocked, since both need a real Next.js request context a test process doesn't have; `acceptInvitationAction` additionally needed `@/lib/auth/server`'s `auth.getSession()` mocked, since it authorizes off a real session rather than `requireHousehold()`. Everything else — authorization checks, DB writes, notification logic, the budget-threshold and meal-plan-upsert behavior — is the real code running for real.

## Authorization tests

Started 2026-09-21, expanded same day: every Server Action that takes a client-supplied resource id (list/item, household member, child, invitation, notification) now has a test confirming an id belonging to a different household is rejected rather than trusted from the client. `inviteMemberAction`/`revokeInvitationAction`'s owner-only role check is also covered. Full session/cookie-level authentication testing (an actual signed-in browser session, not a mocked one) is not attempted — that would need e2e testing (e.g. Playwright) against a running dev server, not unit/integration tests.

## Purchase analytics

Real purchases can now be created (`completePurchaseAction`, see section 21) — the analytics functions in `lib/purchase-history.ts` finally have a real write path feeding them, not just seed data. Deeper analytics beyond what's already there (average monthly spend, favorite store, most-bought products, repeat purchases) are still open. The receipt-import idea raised by the owner is now scaffolded (`app/actions/receipts.ts`, `lib/receipts.ts`, `receipt_imports` table — see section 33): manual entry works today and produces a real purchase; the actual OCR/vision extraction step is an explicit placeholder (`unimplementedOcrProvider`) pending the AI phase, and there's no image upload/storage yet either.

## Meal-plan ingredient quantities

Recipes have no per-ingredient quantity/serving-size data (see section 33) — "uses from stock" and "consumes from stock on cooked" are both unit-agnostic, treating one recipe use as consuming exactly one unit of whatever the pantry tracks that ingredient in. Real serving-size data doesn't exist yet; adding it without inventing numbers would need real recipe data as a source.

## International rollout

The Czech implementation is the primary target.

International support is planned later.

## Cron authorization

Fully resolved 2026-09-21: `CRON_SECRET` is set in the Vercel project (Production), PR #4 (`v0/backend` → `main`) is merged, and a production deployment ran. Confirmed live via `vercel cron ls`, which now lists `/api/cron/shopping-reminders` (no longer `not deployed`). The route will get its first real scheduled invocation at the next `0 8 * * *` (08:00 UTC) tick.

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
* real `productId` link from shopping-list items to the catalog (was dead schema; the whole app matched on free-text names before this), plus a native autocomplete on the input so typed text has a real chance of matching
* real purchase-history write path (`completePurchaseAction`, "Dokončit nákup") — `purchases`/`purchase_items` were seed-only and read-only until now; also fixed a data-inventing bug found along the way (`?? 'Lidl'` store fallback)
* household pantry ("spíž"): `pantry_items` table, automatic restocking on purchase, a daily check-in cron, confirm/remove Server Actions, and UI nested in the shopping-list tab (see section 32)
* pantry locations (spíž/lednice/mrazák/domácnost) with keyword-based auto-assignment and manual cross-location moves; stock-aware meal-plan generation and per-meal regeneration; marking a cooked meal deducts its ingredients from the pantry; OCR-ready receipt import with manual entry as the working path today (see section 33)
* currency fields
* migration baseline
* automated tests for selected domains
* Server Action / household-authorization tests for every action file, running against the real dev database rather than mocks
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

# 32. Household Pantry ("Spíž")

**Added 2026-09-22.** A new domain, owner-requested, not part of the original Phase 8 notification set (section 19) but following the same deterministic-generator pattern.

The `pantry_items` table (migration `0003_pantry_items.sql`) tracks what a household believes it currently has at home:

* `completePurchaseAction` (section 21) restocks or creates a pantry row for every item in a finished purchase — matched by `productId` when known, otherwise by case-insensitive name, summing quantity rather than overwriting on a repeat purchase.
* A new daily Vercel Cron job, `/api/cron/pantry-checkin` (`vercel.json`, same `CRON_SECRET` auth model as `shopping-reminders`), asks the household "do you still have this?" once a per-category interval has elapsed since an item was added/restocked or last asked about (`lib/pantry.ts`'s `isDueForCheckin()`/`findDueForCheckin()`). Unlike a shopping reminder, this can fire more than once per item — an unconfirmed pantry item stays relevant rather than being a one-time event.
* `app/actions/pantry.ts`'s `confirmPantryItemAction` ("Ještě mám") resets the check-in interval; `removePantryItemAction` ("Došlo") deletes the row outright, since a future purchase creates a fresh one.
* Per-category check-in intervals (`CHECKIN_DAYS_BY_CATEGORY` in `lib/pantry.ts`) are placeholder defaults (10/30/21/30/14 days), an explicit interim choice since there is no real per-product shelf-life data yet to be more precise than category-level.
* UI: a new `Pantry` component (`components/shopping/pantry.tsx`), nested inside the existing "Nákup" tab below the shopping list rather than as a new top-level tab, per section 29 ("preserve existing navigation... only change UI where required").
* Tests: `lib/pantry.test.ts` (pure check-in-interval logic), `app/actions/pantry.test.ts` (cross-household rejection + behavior for both actions), and two `completePurchaseAction` restocking cases added to `app/actions/purchases.test.ts` (new pantry row, and summed-quantity restock with reset `askedAt`).
* Not yet done: the Smart Shopping Engine (section 22) does not consume pantry state to suggest skipping an already-stocked staple — see `docs/04_ROADMAP.md` Phase C. Full interactive browser verification was not performed this session (no browser available in this environment); verification here was `tsc --noEmit`, `next build`, and the full Vitest suite against the real dev database, plus a smoke check that `next dev` serves pages without a server error.

---

# 33. Pantry Locations, Cross-Location Moves, Stock-Aware Meal Plans, and Receipt Import

**Added 2026-09-22**, owner-requested, on top of the Household Pantry work in section 32.

**Pantry locations.** `pantry_items.location` (migration `0004_pantry_locations_and_receipt_imports.sql`) tracks which of four locations an item lives in: Spíž, Lednice, Mrazák, Domácnost. A new row's location is seeded by `lib/pantry.ts`'s `inferPantryLocation()` — non-food categories go straight to Domácnost, "Potraviny" items are split between Lednice/Mrazák/Spíž by a small, explicitly placeholder Czech keyword list (e.g. "mražen", "zmrzlina" → Mrazák; "mléko", "sýr", "maso" → Lednice; everything else defaults to the shelf). Restocking an *existing* row (a repeat purchase) never re-infers the location, so a manual move survives it. `app/actions/pantry.ts`'s new `movePantryItemAction(id, location)` lets the household reassign any item to any location by hand — general-purpose, which also covers the specific "moved chilled meat into the freezer" case without a separate action. The `Pantry` UI (`components/shopping/pantry.tsx`) now groups items into one card per location and exposes the move as a `<select>` per row.

**Stock-aware meal plans.** `lib/meal-plans.ts`'s `generateWeeklyPlan()` takes an optional `pantryItems` argument (a household opt-in checkbox, "Vytvořit ze zásob", in `components/dashboard/meal-plan.tsx`); when supplied, each meal slot prefers whichever candidate recipe in its pool uses the most currently-in-stock ingredients (`matchIngredientToStock()`, case/whitespace-insensitive exact name match, no fuzzy matching — same philosophy as `lib/products.ts`). `splitIngredientsByStock()` then separates the full plan's ingredient list into what's already at home (`fromStock`) and what still needs buying (`toBuy`); "Přidat chybějící do nákupního seznamu" now adds only `toBuy`, regardless of whether stock-aware generation was used — never adding something already in the pantry to the shopping list. **Not modeled**: recipes have no per-ingredient quantity (a shopping-list item defaults to 1 the same way), so "uses stock" and "consumes stock" (below) are both unit-agnostic — one recipe use consumes exactly one unit of whatever the pantry tracks that ingredient in, not a realistic serving size. Real serving-size data doesn't exist yet; inventing it was explicitly avoided.

**Regenerate a single meal.** `regenerateMeal(plan, day, mealType, household, pantryItems?)` swaps out just one day's one meal slot (a "🔄" button per meal in the UI) rather than discarding the whole week, always excluding the currently-shown recipe so a click reliably produces something different; deterministic (no randomness), so it stays unit-testable.

**Mark a meal cooked → deduct from stock.** Each meal now has a "✓" button. `app/actions/meal-plan.ts`'s new `markMealCookedAction(day, mealType)` looks up the household's saved plan for the current week, and for each of that recipe's ingredients, decrements the matching pantry row's quantity by 1 (deleting the row outright if it would hit zero), then records the meal as cooked in the plan's new `cookedMeals: string[]` field (`WeeklyMealPlan`). Idempotent — marking an already-cooked meal again does nothing, so a duplicate click can't double-deduct. Never invents or goes negative: an ingredient with no matching pantry row (or already at zero) is simply skipped. One-directional by design — there is no "unmark" that restores what was deducted, since nothing tracks exactly what a specific marking deducted in order to reverse it.

**Receipt import, OCR-ready.** New `receipt_imports` table (same migration) and `app/actions/receipts.ts`'s `importReceiptAction()` turn a set of line items into a real purchase — same downstream effect as `completePurchaseAction` (one `purchases`/`purchase_items` row set, plus pantry restocking via the same shared `restockPantryItem()`, now moved from `app/actions/purchases.ts` into `lib/db/queries.ts` so both call sites share one implementation). Every import today has `source: 'manual'`: `components/budget/receipt-import.tsx` is a plain hand-entry form (name/category/quantity/unit/price rows, optional store and date) — there is no OCR yet, and the UI says so explicitly rather than pretending otherwise. `lib/receipts.ts` defines the seam a real OCR/vision provider plugs into later (`ReceiptOcrProvider` interface, `ExtractedReceipt` shape) with only a placeholder `unimplementedOcrProvider` that throws — per CLAUDE.md section 30, no AI SDK/vision-model call is wired up before the AI phase. When OCR does arrive, only how `items` gets populated needs to change; the Server Action, schema, and pantry-restocking path do not. **Deliberately not done**: actual image upload/storage (would need a blob-storage integration, a separate concern) — `receipt_imports` has no image column yet, since there's nowhere to put one.

Tests: `lib/pantry.test.ts` (`inferPantryLocation`), `app/actions/pantry.test.ts` (`movePantryItemAction` authorization + behavior), `app/actions/purchases.test.ts` (location inference on a new row, location preserved on restock), `lib/meal-plans.test.ts` (stock-aware generation, `matchIngredientToStock`, `splitIngredientsByStock`, `regenerateMeal`, `markMealCooked`/`isMealCooked`/`recipeFor`), `app/actions/meal-plan.test.ts` (`markMealCookedAction`: deduction, idempotency, zero-quantity row removal, missing-ingredient skip), `app/actions/receipts.test.ts` (`importReceiptAction`: purchase creation, pantry restocking, `receipt_imports` record). 145/145 tests passing; `tsc --noEmit` and `next build` both clean. As with section 32, full interactive browser verification was not performed this session (no browser available in this environment) — verification here is type-check/build/test only.

---

# 34. Current Development Principle

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
