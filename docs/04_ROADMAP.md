# Shopping Buddy — Development Roadmap

## Phase A — Current: backend foundation
1. Audit repository and Neon schema.
2. Establish authentication/session strategy.
3. Establish typed Neon data-access layer.
4. Establish household/user authorization.
5. Persist profiles/preferences/children.
6. Persist shopping lists/items.
7. Persist budgets/expenses.
8. Normalize products/categories/stores.
9. Persist prices/deals with history.
10. Persist meal plans and purchase history.
11. Remove feature-level mock data gradually.
12. Fix TypeScript/build debt and add tests.

## Phase B — Shared household
- invitations/membership
- roles/permissions
- concurrent edits
- household-wide shopping lists
- household-wide preferences where appropriate

## Phase C — Smart Shopping Engine
- ~~compare selected stores~~ done: `lib/prices.ts`'s `compareStoreTotals`/`cheapestPossibleTotal`, surfaced as `components/shopping/store-comparison.tsx` on the shopping-list tab (see `docs/07_CHANGELOG.md`)
- ~~unit-price comparison~~ done — was already covered per-item by `PriceComparison`; the above extends it to whole-list, whole-store totals
- ~~promotion quality~~ done: `lib/prices.ts`'s `assessDealQuality()`, wired into `price-watch.tsx` — flags a deal that isn't actually the cheapest price for that product across known stores (see `docs/07_CHANGELOG.md`)
- stock/storage constraints
- ~~trip-distance constraints~~ done: `lib/geo.ts`'s `nearestLocation()`, surfaced in `store-comparison.tsx` next to each store's total when the user has granted location (shared, via a new `useUserLocation()` hook, with the Stores tab's existing opt-in — never a second prompt). Shown as one more factor, never auto-selects the nearest store, per `docs/05_BUSINESS_RULES.md` (see `docs/07_CHANGELOG.md`)
- ~~budget constraints~~ done: `lib/budget.ts`'s `budgetImpact()`, surfaced in `store-comparison.tsx` — flags when even the cheapest store option exceeds the household's remaining monthly budget, otherwise shows what percentage of it the trip would use (see `docs/07_CHANGELOG.md`)
- bulk-buy recommendations
- historical-price awareness

## Phase D — Notifications
- price/deal alerts
- shopping reminders
- ~~budget warnings~~ done: `lib/budget.ts`'s `crossedBudgetThreshold()`, wired into `addExpenseAction` — fires a real notification exactly once when spending crosses 80% or 100% of the household's budget, never re-fires while already in the same band (see `docs/07_CHANGELOG.md`)
- household events

## Phase E — Global
- country/locale/currency
- retailer adapters
- localized units and taxes where relevant
- localized language
- regional data providers

## Phase F — Product hardening
- security audit
- accessibility
- performance
- observability
- backup/recovery strategy
- test coverage
- release process

## Phase G — AI Shopping Assistant
**Deliberately last, not after Phase B as originally ordered** — explicit product decision (2026-09-21): real AI integration needs a provider/model chosen through the Vercel AI Gateway, which carries an ongoing per-call cost. The owner wants every other phase's foundations (including hardening) solid first, with no LLM spend until then. Until this phase starts: no AI SDK/Gateway dependency, no LLM calls, `components/ai/ai-assistant.tsx` stays a UI-only placeholder. "Preparing the environment" for this phase means keeping the data layer well-structured and documented (`lib/db/queries.ts`, `docs/06_AI_RULES.md`) — not pre-scaffolding a provider integration.
- grounded context retrieval
- natural-language shopping commands
- meal-plan assistance
- explanations of price and budget choices
- strict anti-hallucination rules

## Rule
Do not implement a later phase by weakening the foundations of an earlier phase.
