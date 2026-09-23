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
- ~~stock/storage constraints~~ done: a household pantry (`lib/pantry.ts`, `pantry_items`) tracks what the household believes it has at home — by location (Spíž/Lednice/Mrazák/Domácnost, `inferPantryLocation()`, manually reassignable) — restocked automatically by `completePurchaseAction`/`importReceiptAction` and re-checked periodically (per-category interval) by a daily cron, `/api/cron/pantry-checkin`. The Smart Shopping Engine's shopping-list optimization itself still doesn't consume pantry state directly; what does now consume it is meal-plan generation (`generateWeeklyPlan(..., pantryItems)`), which can prefer recipes using what's in stock and skips already-owned ingredients when adding to the shopping list (see `docs/07_CHANGELOG.md`)
- ~~trip-distance constraints~~ done: `lib/geo.ts`'s `nearestLocation()`, surfaced in `store-comparison.tsx` next to each store's total when the user has granted location (shared, via a new `useUserLocation()` hook, with the Stores tab's existing opt-in — never a second prompt). Shown as one more factor, never auto-selects the nearest store, per `docs/05_BUSINESS_RULES.md` (see `docs/07_CHANGELOG.md`)
- ~~budget constraints~~ done: `lib/budget.ts`'s `budgetImpact()`, surfaced in `store-comparison.tsx` — flags when even the cheapest store option exceeds the household's remaining monthly budget, otherwise shows what percentage of it the trip would use (see `docs/07_CHANGELOG.md`)
- ~~bulk-buy recommendations~~ done: no real per-package bulk-pricing data exists (would need product variant/package-size modeling — still open, deliberately not invented), so this approximates the business rule ("large quantities may be recommended when savings are meaningful and the household can reasonably use/store the quantity — do not optimize price alone") with what's real today: `lib/prices.ts`'s `suggestsStockingUp()` flags a deal only when it's genuinely the best price *and* the household's real pantry data (`lib/pantry.ts`'s `pantryQuantityFor()`) shows 1 or fewer in stock — never suggested just because a price is good. Surfaced as a "doplňte zásoby" note in `price-watch.tsx`. Verified end-to-end against real deal/pantry data: badge appears with 0 in stock, disappears once restocked, independently per product (see `docs/07_CHANGELOG.md`)
- ~~historical-price awareness~~ foundation done: `prices` was seeded once and never re-observed, so there was no real history to be aware of yet. `lib/db/queries.ts`'s `recordPriceObservation()` now appends a new dated row instead of overwriting (nothing calls it yet — no ingestion source is wired up); `getProductPrices()` surfaces the full per-store history alongside the latest price; `lib/prices.ts`'s `isHistoricLow()` flags a deal that's a genuine all-time low, not just today's discount, wired into `assessDealQuality()` and shown in `price-watch.tsx`. Verified end-to-end against the real database with a temporary product (three dated observations, correct latest-price selection, correct history, correct `isHistoricLow`), not just unit tests (see `docs/07_CHANGELOG.md`)

## Phase D — Notifications
- ~~price/deal alerts~~ done: `addShoppingItemAction` checks `assessDealQuality()` when an item is added and notifies the household only if there's a currently active deal that's genuinely the best price for that product — not just any discount (see `docs/07_CHANGELOG.md`)
- ~~shopping reminders~~ done: unlike the other two notification generators, this one isn't triggered by a user action — it's time-based (explicit product decision 2026-09-21: use a real daily Vercel Cron job rather than faking staleness off a page load). `app/api/cron/shopping-reminders` runs daily, finds items on a household's list that are still undone `STALE_AFTER_DAYS` (3) after being added (`lib/reminders.ts`'s `findStaleItems()`), and fires one reminder notification per household, marking those items so the same item never reminds twice (see `docs/07_CHANGELOG.md`)
- ~~budget warnings~~ done: `lib/budget.ts`'s `crossedBudgetThreshold()`, wired into `addExpenseAction` — fires a real notification exactly once when spending crosses 80% or 100% of the household's budget, never re-fires while already in the same band (see `docs/07_CHANGELOG.md`)
- ~~household events~~ done: joining a household via invitation (either path — auto-join on first login, or explicit `acceptInvitationAction` from `/invite/[token]`) now notifies the household that a new member joined. Both paths were duplicating the same insert/update logic, so this also deduplicated them into one shared `joinHouseholdViaInvitation()` in `lib/db/queries.ts` (see `docs/07_CHANGELOG.md`)

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

**Explicit exception (2026-09-22):** OCR receipt import is *not* part of this phase's gate — the owner approved AI-SDK use for it specifically, ahead of everything else here (see `CLAUDE.md` section 30, `docs/08_OCR_RECEIPT_PIPELINE.md`). It's a narrow utility use of the cheapest available model to structure already-OCR'd text, not the conversational assistant this phase is about. Tracked in `docs/01_CURRENT_STATE.md` section 21 "Purchase History", not here.

## Rule
Do not implement a later phase by weakening the foundations of an earlier phase.
