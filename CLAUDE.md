# Shopping Buddy — Claude Code Instructions

## 1. Project Identity

**Project:** Shopping Buddy
**Repository:** `stordik-alt/Shopping_Buddy`

Shopping Buddy is a family shopping assistant focused initially on the Czech market.

The application helps households:

* manage household members and profiles
* manage shopping lists
* plan meals
* track prices and promotions
* compare stores
* manage budgets and expenses
* track purchases and history
* optimize shopping trips
* send useful notifications
* eventually provide AI-assisted shopping recommendations

The application should be designed so that the Czech implementation can later be extended internationally.

---

# 2. Source of Truth

Before making architectural or backend changes, inspect these documents:

1. `docs/00_PROJECT_CONTEXT.md`
2. `docs/01_CURRENT_STATE.md`
3. `docs/02_ARCHITECTURE.md`
4. `docs/03_DATABASE.md`
5. `docs/04_ROADMAP.md`
6. `docs/05_BUSINESS_RULES.md`
7. `docs/06_AI_RULES.md`
8. `docs/07_CHANGELOG.md`

Also inspect the actual implementation and database schema.

### Important

Documentation can become outdated.

When documentation conflicts with verified code or the live database:

1. inspect the implementation
2. verify the database schema
3. determine the actual current behavior
4. update the documentation if appropriate

Never blindly implement an old document.

Historical documents such as older `docs/01...15` feature-stage documents should not be deleted or rewritten unless explicitly requested.

---

# 3. Git Branch Strategy

## Stable branch

`main`

`main` represents the stable project state.

Do not make backend development changes directly on `main`.

## Backend development branch

`v0/backend`

All current backend development should happen on:

```text
v0/backend
```

The branch should originate from the latest `main`.

### Rules

Before starting work:

1. inspect the current branch
2. inspect the latest `main`
3. ensure `v0/backend` is based on the current `main`
4. switch/use `v0/backend` for backend development

If `v0/backend` does not exist, create it from the latest `main`.

Do not create backend work from an outdated branch.

### Old branch

`V0/continue-frontend`

This branch is historical/obsolete unless explicitly requested.

Do not use it as the current backend development branch.

Do not introduce new development there.

### Pull requests

Backend work should follow:

```text
main
  ↓
v0/backend
  ↓
development / testing
  ↓
pull request
  ↓
main
```

Do not bypass this workflow unless explicitly instructed.

---

# 4. Technology Stack

Current stack:

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

Do not introduce a different backend architecture without a clear technical reason.

### Explicitly do NOT reintroduce

* Python/FastAPI backend
* SQLite as the production database
* a second independent backend
* unnecessary ORM replacement
* unnecessary state-management framework
* AI SDK/Gateway/provider integration before the AI phase

---

# 5. Engineering Principles

The most important principles are:

1. Inspect before modifying.
2. Preserve working functionality.
3. Prefer small, coherent changes.
4. Keep business logic outside UI components.
5. Keep calculations deterministic and testable.
6. Do not duplicate business logic in multiple places.
7. Do not introduce unnecessary dependencies.
8. Do not hide errors.
9. Do not use `any` unless there is a documented technical reason.
10. Keep code readable.
11. Add comments to important or non-obvious logic.

Important code should explain its purpose.

For example:

```ts
// Calculate the remaining household budget after confirmed expenses.
const remainingBudget = budgetLimit - totalExpenses;
```

Comments should explain **why** something is done when the reason is not obvious, not simply repeat the code.

---

# 6. Backend Architecture

Backend logic should be organized into clear layers.

Prefer:

```text
UI
 ↓
Server Actions / Route Handlers
 ↓
Domain / Business Logic
 ↓
Data Access
 ↓
Drizzle ORM
 ↓
Neon PostgreSQL
```

Do not put critical calculations directly inside React components.

Do not allow the client to determine authorization.

All important authorization decisions must happen server-side.

---

# 7. Database

Neon PostgreSQL is the production database.

Drizzle ORM is the database access layer.

Database schema changes must use migrations.

Do not manually modify production database structure without a corresponding migration.

Before changing schema:

1. inspect the existing schema
2. inspect existing relations
3. inspect existing indexes and constraints
4. inspect existing migrations
5. determine whether existing data must be migrated
6. create the migration
7. test the migration

Use the existing migration workflow.

Current migration commands include:

```bash
pnpm db:migrate
```

Do not create duplicate tables or parallel representations of the same domain concept.

---

# 8. Database Integrity

Database constraints should enforce important invariants whenever practical.

Examples:

* unique household membership
* unique active product profiles where required
* valid foreign keys
* valid currencies
* valid store references
* valid product references
* valid user/household relationships

Application validation and database constraints should complement each other.

Do not rely exclusively on UI validation.

---

# 9. Authentication and Authorization

Authentication is handled through Neon Auth.

Protected application routes must remain protected.

Every household-scoped operation must verify that the authenticated user belongs to the relevant household.

Never trust:

* client-provided household IDs
* client-provided user IDs
* client-provided ownership flags
* client-provided roles

The server must determine the authenticated user and authorized household.

Never bypass:

* authentication
* authorization
* CAPTCHA
* access controls
* security mechanisms
* rate limits or technical restrictions

---

# 10. Household Model

Shopping Buddy is household-centric.

A household can contain:

* adults
* children
* preferences
* shopping lists
* budgets
* expenses
* purchases
* meal plans
* notifications
* store preferences
* price/deal data relevant to the household

Shared household functionality must preserve authorization boundaries.

Current membership model:

* owner
* member

Invitations are stored and processed through the existing invitation system.

Concurrent editing currently uses lightweight refresh/polling rather than websockets.

Do not introduce realtime infrastructure unless there is a concrete requirement.

---

# 11. Shopping Lists

Shopping lists must support persistent database storage.

A shopping list can contain:

* products
* quantities
* units
* completion state
* optional store association
* optional price information
* optional notes

Shopping-list business logic should remain deterministic.

Do not put important shopping-list calculations exclusively in the UI.

---

# 12. Products

Products need stable identities.

Do not treat product names as sufficient identifiers.

The product architecture should support:

* product
* brand
* variant
* package size
* unit
* category
* normalized quantity
* barcode where available

Product normalization is important for price comparison.

Example:

```text
Milk 1L
Milk 500ml
Milk 2L
```

must not be treated as equivalent simply because their display names contain the same word.

---

# 13. Product Categories

Categories should be reusable across:

* products
* shopping lists
* meal plans
* purchases
* price comparison
* promotions

Avoid hardcoding category logic in multiple UI components.

---

# 14. Stores

Initial Czech store chains:

* Lidl
* Albert
* Kaufland
* Billa
* JIP
* Penny

The store architecture must support future expansion.

A store chain and an individual physical store location are different concepts.

Prefer:

```text
Store chain
    ↓
Store location
```

Store locations should contain reliable geographic information where available.

Do not invent store locations.

---

# 15. Prices and Promotions

Price and promotion data are a major part of Shopping Buddy.

The application should eventually be able to obtain current prices and promotions from permitted internet sources.

Possible sources include:

* official retailer APIs
* official retailer feeds
* public retailer data
* permitted public websites
* permitted third-party data providers

### Important restrictions

Never:

* bypass CAPTCHA
* bypass authentication
* bypass access controls
* bypass technical restrictions
* scrape data in violation of applicable restrictions
* invent prices
* invent promotions
* pretend that unavailable data is current

If a source cannot legally or technically be accessed, use another permitted source.

---

# 16. Price Data Provenance

Every imported price/deal should retain enough information to determine:

* source
* store
* product
* price
* currency
* timestamp
* validity period when known
* source identifier when available
* promotion information when applicable

Do not silently overwrite historical price information.

Price history is important for:

* price comparison
* determining whether a promotion is meaningful
* household savings
* trend analysis
* future recommendations

---

# 17. Price Normalization

Price comparison should preferably use normalized units.

Examples:

```text
Kč/kg
Kč/l
Kč/100 g
Kč/100 ml
Kč/ks
```

The system should distinguish:

```text
package price
```

from:

```text
normalized unit price
```

Do not compare products of different package sizes using only the displayed package price.

---

# 18. Promotions

A promotion is not automatically a good deal.

Promotion evaluation may consider:

* previous price
* current price
* historical price
* percentage discount
* unit price
* package size
* promotion duration
* household demand
* product preference
* store distance
* total shopping-trip cost

Do not label something as a “great deal” simply because a retailer displays a high percentage discount.

---

# 19. Shopping Optimization

The shopping optimizer should consider multiple factors.

Potential factors:

* product price
* normalized unit price
* promotion
* quantity required
* household budget
* preferred stores
* distance
* travel cost
* number of stores
* product availability
* product preferences
* excluded products

The goal is not necessarily to minimize the price of one item.

The system should be able to optimize the overall shopping trip.

Example:

```text
Store A:
cheaper milk

Store B:
cheaper meat

Store C:
cheaper vegetables
```

Driving to all three stores may cost more than buying everything at Store A.

Optimization logic must therefore be deterministic and testable.

---

# 20. Currency and Localization

The default currency is:

```text
CZK
```

The application should not permanently hardcode currency formatting into business logic.

Households should eventually support different currencies.

Prices and deals contain currency information.

UI localization should be separated from domain logic.

Do not assume Czech locale everywhere in reusable business logic.

---

# 21. Budget and Expenses

Budget functionality must be persisted in Neon.

Budget calculations must be deterministic.

Examples:

* monthly budget
* expenses
* remaining budget
* percentage used
* threshold notifications

Current threshold behavior includes important thresholds such as:

```text
80%
100%
```

Do not calculate critical budget state only on the client.

---

# 22. Notifications

Notifications should be generated from deterministic application events where possible.

Examples:

* budget threshold reached
* unusually high spending
* important promotion
* shopping-list reminder
* expiring promotion
* household-related event

Do not introduce AI merely to generate notifications that can be implemented deterministically.

---

# 23. Meal Plans

Meal planning should integrate with:

* household members
* preferences
* exclusions
* children
* shopping lists
* products
* budget

The existing recipe catalog can remain code-based where intentionally designed that way.

Generated weekly plans should be persisted.

Avoid creating a second meal-plan system.

---

# 24. Purchase History

Purchases should be stored persistently.

Purchase history should eventually support:

* spending analysis
* frequently purchased products
* recurring purchases
* price trends
* household consumption patterns
* shopping optimization

Do not infer historical purchases from current prices.

---

# 25. Testing

Every meaningful backend feature should have tests.

Prioritize tests for:

* business rules
* price normalization
* promotion evaluation
* shopping optimization
* budget calculations
* authorization
* household scoping
* data transformations
* database operations

Do not rely only on UI testing.

When fixing a bug:

1. reproduce it
2. identify the root cause
3. add a regression test where practical
4. fix the underlying issue
5. verify existing functionality

---

# 26. Error Handling

Errors should be explicit and useful.

Do not silently swallow exceptions.

Bad:

```ts
try {
  ...
} catch {
  return null;
}
```

unless returning `null` is explicitly part of the domain contract.

Prefer meaningful error handling.

User-facing errors should be understandable.

Internal errors should retain enough information for debugging.

Never expose secrets or sensitive server information to the client.

---

# 27. Loading / Error / Empty States

Every important data-driven UI should account for:

* loading
* success
* empty
* error

Do not assume that database queries always return data.

Empty states should explain what the user can do next where appropriate.

---

# 28. Mobile-First UI

Shopping Buddy is primarily a mobile-oriented application.

UI must work well on:

* mobile phones
* tablets
* desktop

Do not allow important information to overflow outside the viewport.

Pay particular attention to:

* tables
* cards
* dialogs
* navigation
* filters
* long product names
* prices
* charts
* horizontally scrollable content

If horizontal scrolling is necessary, it must be intentional and usable.

---

# 29. UI Preservation

The existing working UI should not be unnecessarily redesigned during backend work.

When implementing backend functionality:

* preserve existing layout
* preserve existing navigation
* preserve existing styling
* preserve working interactions

Only change UI where required to expose the new functionality or fix a real usability problem.

---

# 30. AI Shopping Assistant — FINAL PHASE

The AI Shopping Assistant is intentionally deferred until the rest of the platform is stable.

Do NOT introduce:

* Vercel AI SDK
* AI Gateway
* OpenAI provider
* other LLM provider
* model API calls
* embeddings
* AI agents

before the final AI phase unless explicitly requested.

The AI assistant should be implemented only after:

1. core backend is stable
2. authentication is stable
3. household model is stable
4. shopping lists are stable
5. budget/expenses are stable
6. products are normalized
7. prices are reliable
8. promotions are reliable
9. meal plans are stable
10. purchase history is stable
11. optimization is stable
12. notifications are stable
13. internationalization foundation is ready

AI should consume reliable application data rather than compensate for missing application logic.

**Explicit exception (2026-09-22, owner-approved):** receipt OCR import (`docs/08_OCR_RECEIPT_PIPELINE.md`) is allowed to use the Vercel AI SDK and an LLM call now, ahead of the AI phase above. The owner's own words: *"OCR chci mít vyřešené, na konec necháme AI asistenta. Toto AI je pouze pro import účtenek"* — this is a narrow, utility use of a model as one step of a deterministic pipeline (Google Cloud Vision does the actual OCR; the cheapest available model just restructures already-extracted text into JSON, never inventing a value — see `lib/receipts.ts`), not the conversational/recommendation "AI Shopping Assistant" this section defers. That assistant (`components/ai/ai-assistant.tsx`) and the rest of this section's ordering remain untouched — this exception covers only the receipt-structuring call in `lib/receipts.ts`'s `geminiStructuringProvider`, nothing broader. Do not treat this as opening the door to AI SDK usage elsewhere without a similarly explicit ask.

---

# 31. AI Cost Control

When the AI phase eventually starts:

* minimize unnecessary model calls
* prefer deterministic logic where possible
* cache reusable results
* avoid sending large datasets unnecessarily
* use structured outputs where appropriate
* track AI usage/cost
* avoid AI calls for simple calculations
* never use an LLM when a normal database query or algorithm is sufficient

---

# 32. Internet Data Integration

Internet data integration should be designed as a replaceable ingestion layer.

Prefer an architecture similar to:

```text
External Source
      ↓
Fetcher / Connector
      ↓
Normalizer
      ↓
Validator
      ↓
Database
      ↓
Price / Promotion Engine
      ↓
UI
```

Do not couple UI components directly to external retailer websites.

External data should be normalized before being used by the application.

Every connector should have clear failure handling.

If a retailer source stops working, the rest of the application should continue functioning.

---

# 33. Data Validation

External data must be validated before persistence.

Validate at minimum:

* product identity
* store identity
* price
* currency
* package size
* unit
* timestamps
* promotion validity

Reject or flag suspicious data rather than silently inserting it.

Examples of suspicious data:

* negative prices
* impossible quantities
* missing product identity
* invalid currency
* promotion ending before it starts
* duplicate records
* malformed package sizes

---

# 34. Duplicate Handling

External imports must be idempotent where possible.

Running the same import twice should not create uncontrolled duplicates.

Use:

* stable external IDs
* unique constraints
* source identifiers
* timestamps
* normalization

Do not solve duplicates by simply deleting all existing records.

---

# 35. Documentation

When functionality changes significantly:

Update:

* `docs/01_CURRENT_STATE.md`
* `docs/07_CHANGELOG.md`

When architecture changes:

Update the relevant architecture documentation.

Documentation should describe the actual implemented state.

Do not document functionality that does not exist.

---

# 36. Working Method for Claude

Before making changes:

### Step 1 — Inspect

Inspect:

* repository structure
* relevant source files
* database schema
* existing functions
* existing tests
* relevant documentation

### Step 2 — Explain the change internally

Determine:

* affected files
* affected database tables
* affected business logic
* affected UI
* migration requirements
* test requirements

### Step 3 — Implement the smallest coherent change

Do not rewrite unrelated parts of the application.

### Step 4 — Validate

Run appropriate:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Use only the commands that actually exist in `package.json`.

If one fails, investigate the root cause.

Do not hide the error.

### Step 5 — Review

Check:

* authorization
* database integrity
* mobile UI
* loading states
* error states
* empty states
* regressions
* duplicated logic
* unnecessary dependencies

### Step 6 — Documentation

Update documentation if the implementation changed the documented project state.

### Step 7 — Changelog

Add a concise entry describing the completed change.

---

# 37. Important Development Rule

Never blindly implement a large feature based only on a user description.

First inspect the existing project.

If functionality already exists:

* extend it
* fix it
* refactor only when necessary

Do not create duplicate implementations.

Before creating a new helper, service, table, component, or API:

**search the repository for an existing implementation.**

---

# 38. Dependency Rules

Before adding a package:

1. determine whether the functionality already exists
2. determine whether an existing dependency can provide it
3. determine whether the package is compatible with the current stack
4. consider bundle size and maintenance
5. only then add the dependency

Do not add dependencies simply for convenience.

---

# 39. Security Rules

Never commit:

* API keys
* passwords
* authentication secrets
* database credentials
* private tokens
* `.env` secrets

Use environment variables.

Do not expose server-only secrets to client components.

Do not weaken authentication or authorization to make a feature easier to implement.

---

# 40. Current Development Priority

The preferred development order is:

```text
1. Audit existing application
2. Backend/data-access foundation
3. Authentication/session
4. Household/profile
5. Shopping lists
6. Budget/expenses
7. Products/prices/promotions
8. Meal plans/history
9. Shared household
10. Shopping optimization
11. Notifications
12. Internationalization/global rollout
13. AI Shopping Assistant
```

Do not jump to AI simply because it is visually attractive.

The application must first have reliable structured data and deterministic business logic.

---

# 41. Definition of Done

A feature is not considered complete merely because the UI renders.

A feature is complete when appropriate:

* TypeScript types are correct
* database persistence works
* authorization works
* business logic is deterministic
* loading state exists
* error state exists
* empty state exists
* mobile layout works
* tests exist where appropriate
* no obvious regression exists
* documentation is updated when needed
* changelog is updated when appropriate

---

# 42. Final Rule

The primary objective is to build a reliable, maintainable Shopping Buddy application.

Prioritize:

```text
Correctness
→ Data integrity
→ Security
→ Maintainability
→ Testability
→ Performance
→ UX
→ Advanced features
→ AI
```

Do not sacrifice database integrity, authorization, or deterministic business logic for a faster implementation.

When uncertain, inspect the existing implementation first and make the smallest safe change that preserves the architecture.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
