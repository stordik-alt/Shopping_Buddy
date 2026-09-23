# Shopping Buddy — Current State

**Repository:** `stordik-alt/Shopping_Buddy`
**Stable branch:** `main`
**Current backend development branch:** `v0/backend`
**Previous frontend branch:** `V0/continue-frontend` — historical/obsolete unless explicitly requested
**Last updated:** 2026-09-23

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

**Update 2026-09-22, mobile horizontal overflow.** Earlier the same day, two blanket fixes landed (`overflow-x: clip` on `body` and `<main>`) to stop the whole page from horizontally scrolling on mobile, plus a touch-target/mobile-nav pass (`components/shared/mobile-nav.tsx`, `nav-item.tsx`). The owner reported the underlying complaint was still there: *"texty přetékají pryč z obrazovky, nechci rollovat"* (text overflows off the screen, I don't want to scroll). Investigated hands-on with a real headless-browser session at a 375px mobile viewport, checking every tab's actual DOM (any element whose right edge exceeds the viewport, not just `document.documentElement.scrollWidth`) rather than trusting the earlier fix — the `overflow-x: clip` fix explained why the *page* never scrolled, but didn't explain what was happening to content that would have overflowed: it was invisibly clipped, not wrapped, which is worse than scrolling for reachability.

Found the real cause: `components/shopping/shopping-list.tsx` had two `flex ... overflow-x-auto` rows — the category filter chips (Vše/Potraviny/.../Ostatní) and the shopping-list tab switcher — each meant to scroll horizontally within itself. At 375px width, the category row's last two chips ("Domácnost", "Ostatní") landed off-screen; "Ostatní" specifically was **not just visually cut off but functionally unreachable** — no visible scrollbar or affordance hinted a horizontal swipe would reveal it, so that category filter was effectively broken on mobile. Fixed by switching both rows from `overflow-x-auto` to `flex-wrap` — every chip now wraps onto additional lines instead of requiring a scroll, matching the owner's explicit "no scrolling" preference; confirmed via the same automated per-element check (re-run across all 6 tabs, plus an expanded shopping-item detail row) that zero elements now exceed the viewport anywhere in the app. No other `overflow-x-auto` patterns existed elsewhere in `components/`.

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

**Update 2026-09-23:** Price storage was upgraded from a branch-only snapshot model to an explicit immutable observation model. Migration `0010_price_observation_model.sql` has now been applied successfully to the production Neon database, so the deployed application code and production schema are synchronized. Each observation now keeps the retailer chain, optional physical branch, scope (STORE / STORE_FORMAT / REGION / CHAIN), source (RECEIPT / OFFICIAL / FLYER / API / OTHER), location-resolution state, observation date, validity window, optional source reference and optional confidence. Existing branch-linked rows are backfilled with their chain ID and remain STORE + RESOLVED. A receipt whose branch is unknown can therefore be stored as STORE + store_id + NULL location + UNKNOWN without being converted into a CHAIN price. `getProductPrices()` derives the current value from the latest observation in each product/retailer/context group while retaining the full observation history.

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
* stock/storage constraints — done 2026-09-22 via the household pantry (section 33): meal-plan generation can prefer in-stock ingredients and skips already-owned ones when adding to the shopping list. The shopping-list optimization itself (`compareStoreTotals`/`cheapestPossibleTotal`) still doesn't consume pantry state directly — see `docs/04_ROADMAP.md` Phase C for the precise scope of what's done
* bulk-buy recommendations — done 2026-09-22: `lib/prices.ts`'s `suggestsStockingUp()` combines a real "genuinely best price" deal signal with real pantry-quantity data (not invented package/bulk-pricing data, which still doesn't exist) — flags a deal as worth stocking up on only when the household has 1 or fewer in stock. Surfaced in `price-watch.tsx`. This closes out Phase C — every item in `docs/04_ROADMAP.md`'s Smart Shopping Engine phase is now done

The engine is intended to optimize the overall shopping trip rather than simply find the cheapest individual item.

Future improvements should include:

* number of stores visited
* travel cost
* household preferences
* product availability
* required quantities
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

**Explicit exception (2026-09-22, owner-approved):** receipt OCR import is allowed to use the Vercel AI SDK now — see `CLAUDE.md` section 30 and `docs/08_OCR_RECEIPT_PIPELINE.md` for the full reasoning. Narrow and specific to `lib/receipts.ts`'s structuring step; the conversational "AI Shopping Assistant" itself stays deferred to last.

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

**Update 2026-09-22:** The owner provided a full target design for the real OCR pipeline (Google Cloud Vision for OCR, a cheap structuring model like Gemini Flash-Lite, validation/confidence/duplicate-detection rules, a full import state machine) — captured verbatim as `docs/08_OCR_RECEIPT_PIPELINE.md`. **Planning only, not implemented** — it calls external AI/model APIs, which `CLAUDE.md` section 30 forbids before the AI phase (or explicit owner authorization as an exception). The doc includes an explicit mapping of the proposal onto the schema/code that already exists (`receipt_imports`, `ReceiptOcrProvider`, `importReceiptAction`) so implementation doesn't accidentally build a parallel system when this phase actually starts.

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

Tests: `lib/pantry.test.ts` (`inferPantryLocation`), `app/actions/pantry.test.ts` (`movePantryItemAction` authorization + behavior), `app/actions/purchases.test.ts` (location inference on a new row, location preserved on restock), `lib/meal-plans.test.ts` (stock-aware generation, `matchIngredientToStock`, `splitIngredientsByStock`, `regenerateMeal`, `markMealCooked`/`isMealCooked`/`recipeFor`), `app/actions/meal-plan.test.ts` (`markMealCookedAction`: deduction, idempotency, zero-quantity row removal, missing-ingredient skip), `app/actions/receipts.test.ts` (`importReceiptAction`: purchase creation, pantry restocking, `receipt_imports` record). 145/145 tests passing; `tsc --noEmit` and `next build` both clean. As with section 32, full interactive browser verification was not performed *in that session* (no browser was available in that environment) — see the follow-up immediately below, where one was added and actually found real bugs unit/integration tests couldn't have caught.

**Update 2026-09-22, browser verification.** `@playwright/test` was added as a dev dependency specifically so a real headless Chromium session could drive this feature end to end against the real dev server and real dev database (sign up a disposable test account, add/buy an item, move it between pantry locations, generate a stock-aware plan, regenerate a meal, mark one cooked, import a receipt). This found two real bugs neither the type-checker nor the test suite could see, since both are about client-side runtime behavior against a live server:

1. **Bulk shopping-list adds could appear to silently do nothing.** `addIngredients()` in `components/app-shell.tsx` (used by "Přidat chybějící do nákupního seznamu" and the older "add all ingredients" button) fired one `addShoppingItemAction` per ingredient concurrently via `Promise.all`. Every insert actually succeeded — confirmed by reloading the page, which showed the correct data — but with a dozen-plus concurrent Server Actions each independently calling `revalidatePath('/')`, the client could apply a stale mid-batch server snapshot over the correct optimistic UI state, leaving the shopping list looking empty until a hard reload. This was always latent (the original "add all ingredients" button could already trigger 20-30 concurrent adds) but went from rare to routine once stock-aware meal plans made large `toBuy` lists common. Fixed by awaiting each add sequentially instead of concurrently, so at most one revalidation is ever in flight. **Known residual limitation, not fixed**: two genuinely *different* slow operations started back-to-back (e.g. triggering another bulk add while one is still mid-flight) can still race the same way, since every Server Action in this app does its own independent `revalidatePath()` with no app-wide serialization. Given how rare that specific sequence is in real use, and per CLAUDE.md's smallest-coherent-change principle, a full fix (e.g. serializing all revalidations globally) was judged out of scope for this fix.
2. **Pantry-location inference rarely worked in practice.** Quick-adding an item via the shopping list's plain text input always defaulted its category to the schema default `'Ostatní'`, even when the typed name matched a real catalog product — `getProductCatalog()` only ever returned `{id, name}`, never the matched product's real category, and `addShoppingItemAction` never used it. Since `inferPantryLocation()` (section 33 above) branches on category, and almost everything added this way landed as `'Ostatní'`, real food items essentially never got auto-routed to Lednice/Mrazák — verified with "Kuřecí prsa" landing in Spíž instead of Lednice. Fixed: `getProductCatalog()` now also returns each product's real category (`ProductCatalogEntry.category`), and `addShoppingItemAction` uses the matched product's category when no explicit override is given. Re-verified in the browser: the same "Kuřecí prsa" item now correctly lands in Lednice.

Both fixes covered by new/updated tests (`app/actions/shopping.test.ts`, `lib/products.test.ts`) in addition to the browser re-verification. 147/147 tests passing; `tsc --noEmit` and `next build` both clean. All disposable test accounts/households created during this verification (`neon_auth.user` + `households`, matched by the `verify*@example.com`/`Verify Tester*` naming used throughout) were deleted afterward — confirmed zero left behind.

**Update 2026-09-22, real OCR implemented — owner-approved exception to the AI deferral.** Between the update above and this one, the actual Google Vision + Gemini OCR pipeline got implemented in the working tree (not yet committed at that point) — a direct contradiction of the immediately preceding commit, which had explicitly documented OCR as "not implemented... forbidden by CLAUDE.md section 30" as planning-only. Caught before committing: found `lib/receipts.ts` importing `generateObject` from the `ai` package (Vercel AI SDK) and calling `google/gemini-2.5-flash-lite` via the AI Gateway, plus new `@vercel/blob`/`ai`/`zod` dependencies, all uncommitted. Flagged to the owner rather than silently continuing or silently reverting. The owner's decision: *"Chci to dokončit, OCR chci mít vyřešené, na konec necháme AI asistenta. Toto AI je pouze pro import účtenek"* — approved as a narrow, explicit exception (documented in `CLAUDE.md` section 30, this file's section 26, and `docs/04_ROADMAP.md`'s Phase G) covering only `lib/receipts.ts`'s structuring call, not the conversational AI Shopping Assistant, which stays deferred. No real API calls had actually happened yet (`GOOGLE_VISION_API_KEY` isn't set locally; tests use fake OCR/structuring providers), so no cost was incurred before this was caught.

Once approved, finished what was left mid-flight:
- Fixed a real compile error: `getHouseholdData()`'s return object was missing the now-required `pendingReceiptImports` field (the fetch existed but was never added to the `Promise.all` batch or the return statement).
- Fixed real test flakiness, not a logic bug: two tests in `app/actions/receipts.test.ts` intermittently hit vitest's 5s default timeout, because several tests there make real sequential Vercel Blob uploads (`createUploadedReceipt()`) and real network latency occasionally exceeded it — confirmed by re-running the same code twice and seeing different tests fail each time. A timed-out test doesn't cancel its in-flight work, so this risked a zombie continuation corrupting the shared `currentHouseholdId`/`db` state a later test in the same file relied on (this is very likely what caused one test to fail with the wrong error message on one run). Fixed by raising this one file's timeout (`vi.setConfig({ testTimeout: 20_000 })`), not by touching the actual pipeline logic. Confirmed stable across two full clean reruns afterward.
- Removed real duplication the gap had introduced: `ReceiptImportState` (type), `toReceiptImportState()`, and `getPendingReceiptImports()` existed independently in both `lib/db/queries.ts` (used by `getHouseholdData()`, exported) and `app/actions/receipts.ts` (a second copy with `purchaseId` and a hardcoded-always-null `storeName` no code ever populated) — despite `queries.ts`'s own docstring already saying they were meant to be shared. The `receipts.ts` copy's `getPendingReceiptImports()` Server Action was entirely unused (no `.tsx` file called it anywhere) — dead code. Consolidated onto one canonical version in `lib/db/queries.ts` (keeping `purchaseId`, dropping the dead `storeName` placeholder); `app/actions/receipts.ts` now imports it instead of redefining it, per `CLAUDE.md` section 37.
- **Built the missing UI** — the entire OCR pipeline was backend/action-only; no `.tsx` file called `uploadReceiptAction` or any of the review/retry/duplicate actions, so a real user had no way to trigger it. `components/budget/receipt-import.tsx` now has a real "Vyfotit nebo nahrát účtenku" upload button (replacing its "OCR not available" message) alongside the existing manual-entry form. New `components/budget/receipt-pending.tsx` surfaces whatever `HouseholdData.pendingReceiptImports` has waiting: a specific error + retry/discard for a failed import, an editable line-item review form for `review_required`, and a three-way use-existing/save-as-new/cancel choice for `duplicate_review`.
- **Verified in a real browser against the real dev database and real Vercel Blob**, not just tests: signed up a fresh account, uploaded a real (tiny, throwaway) image. Since `GOOGLE_VISION_API_KEY` isn't configured locally, this genuinely exercised the failure path end-to-end — confirmed the specific "GOOGLE_VISION_API_KEY is not configured" error surfaced correctly in the UI, confirmed "Zkusit znovu" (retry) correctly failed the same way again, confirmed "Zahodit" (discard) correctly cleared it and set `receipt_imports.status = 'cancelled'` in the database. Then re-verified manual entry still works as a regression check (it created a real `purchases`/`purchase_items` row with `receipt_imports.status = 'imported'`). All disposable test accounts/data deleted afterward, confirmed zero left behind.
- 187/187 tests passing; `tsc --noEmit` and `next build` both clean.
- **Known gap, not closed here:** `GOOGLE_VISION_API_KEY` is set in Vercel for Production only, not Development, so the real OCR text-extraction step (as opposed to the structuring step, which authenticates via Vercel OIDC and would work locally) cannot be exercised against real output locally — see `docs/08_OCR_RECEIPT_PIPELINE.md` section 12.

**Update 2026-09-22, decimal quantities + storage-location resolution + manual stock edits.** Follow-up pass, per the owner's prompt (which itself assumed per-item category recognition already existed — it didn't; `extractedReceiptItemSchema` had no `category` field at all until this pass). Full detail in `docs/08_OCR_RECEIPT_PIPELINE.md` section 12b; summary here:
- Fixed a real bug first, as instructed: `purchase_items.quantity`/`pantry_items.quantity` were `integer`, not `numeric` — a weight-sold receipt item (e.g. "0,582 kg") would have failed to insert or been truncated. Migrated to `numeric(10,3)` (migration `0006_fearless_thunderbolt.sql`); also fixed the manual-entry/review forms, which clamped typed quantity to a minimum of `1`.
- `lib/pantry.ts`'s `inferPantryLocation()` now returns `null` (never a guessed default) when it genuinely can't classify a food item or the category is the catch-all `'Ostatní'`; new `lib/receipts.ts`'s `resolveItemPlacement()` adds catalog priority on top and now gates `processReceiptImport()`'s automatic completion the same way a missing/inconsistent field already did. An unrecognized unit does too (new `isRecognizedUnit()`).
- A human-confirmed correction (manual entry, or a completed review) now writes its category/unit/location back into the `products` catalog (new `default_location` column, `upsertProductCatalogDefaults()`) — including creating the catalog row for a never-before-seen product — so the next receipt of the same product resolves automatically. Never happens on an unreviewed automatic OCR pass.
- The review form (`components/budget/receipt-pending.tsx`) gained a "Datum" field it was previously entirely missing (a review triggered by a missing date had no way to supply one — `confirmReceiptReviewAction` would have silently used today's date; now it throws instead if none is given) and an "Uložení" select per item.
- New `adjustPantryItemQuantityAction` + a pantry stepper UI for manual stock correction (`−`/exact-value/`+`), separate from purchase history, never touching `purchase_items`.
- Verified in a real browser against the real dev database: decimal quantity round-tripped exactly through manual entry → purchase history → pantry → stepper edit → reload; a seeded `review_required` import correctly showed one blank (ambiguous) and one pre-filled (catalog-resolved) location select, stayed disabled until both a date and every location were set, and produced a purchase with the explicitly-typed date; the confirmed correction was verified written into the product catalog. All test data cleaned up afterward.
- 224/224 tests passing (was 194); `tsc --noEmit`/`next build` clean.

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
---

# 35. Context Continuity

The project now uses a persistent documentation layer to prevent loss of context during long change sequences.

Documentation roles:
- docs/01_CURRENT_STATE.md — what is actually true now; branch, verification state, architecture and current work.
- docs/02_PROJECT_CONTEXT.md — stable long-term technical rules and data semantics.
- docs/03_CHANGELOG.md — significant changes and verification history.
- docs/04_DATABASE_MODEL.md — conceptual database rules; actual Drizzle schema remains authoritative.
- docs/05_TEST_PLAN.md — regression and critical workflow tests.
- docs/06_KNOWN_ISSUES.md — still-relevant issues and recurring failure modes.

When making a substantial change:
1. inspect current state and schema,
2. make the smallest coherent change,
3. test/typecheck/build as applicable,
4. verify the actual runtime workflow when relevant,
5. update CURRENT_STATE and CHANGELOG,
6. record the commit SHA and verification result.

The documentation must never claim a build, deployment, migration or runtime test passed unless it was actually verified.
