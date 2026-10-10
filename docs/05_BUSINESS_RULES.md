# Shopping Buddy — Business Rules

## Household
Shopping recommendations are based on the household profile and its members. User preferences may be personal; household constraints affect shared recommendations.

## Budget
Budget calculations are deterministic. The app must clearly distinguish:
- planned spending
- actual spending
- remaining budget
- committed/planned shopping
- historical spending

Money is actual or planned, never both: a planned income does not change the actual balance until it is marked received, and it is then the same record, so it is never counted twice. Actual balance = received income − paid expenses − executed transfers (`lib/budget-balances.ts`, docs/15 §9). Free money is never negative; a shortfall is reported as a shortfall, not as spendable money.

Period transfers and Kapsy (docs/15 §11–15, `lib/budget-closing.ts`): a transfer between periods is its own operation — not income, expense or saving — and goes only to the period right after. A surplus may be distributed only up to its real amount; a deficit is never saved, it is covered from Kapsy and the uncovered rest is carried on as a negative transfer. The result and the carry of a closed period are recomputed from real data, so changing a closed period changes the carry. A planned Kapsa contribution never changes its balance; ANITKA moves money between the budget and a Kapsa only on the user's confirmation.

Forecast (docs/15 §16–17, `lib/budget-forecast.ts`): predicted balance = actual balance + planned income still to come − unpaid recurring payments of the period − planned Kapsa contributions not yet made; ordinary spending is not guessed. A negative prediction warns in advance and suggests postponing planned savings, using Kapsy, or carrying the rest as a negative transfer — suggestions only, never an automatic move of money.

Planned expenses are expected money only: they enter the forecast but never the actual balance, and paying one creates the real expense exactly once. At the end of a period ANITKA only pre-fills the closing form (keep what the next period needs, top up the reserve, planned Kapsa contributions, the rest to the next period; a deficit from the reserve first); the user decides and the same closing rules validate it.

Periods ahead (docs/15 §14, §16, `lib/budget-outlook.ts`) are planned, never actual: a period that has not begun shows no actual balance and cannot have its incomes received or its planned expenses paid. Its expected balance = what it starts with (the actual balance now for the running period, otherwise the previous period's expected carry) + planned and already-received income − expected spending − planned Kapsa contributions; expected spending is the period's budget, raised to the known payments and planned expenses when those are higher. Only the part explicitly planned for the next period is carried (and never more than the period is expected to end with); a shortfall is carried whole as a negative transfer. When the period is closed the real transfer replaces the plan.

At closing, the money the next period still needs for its known payments and planned expenses (beyond its own income and balance) is shown as reserved for obligations and the user is warned when the split leaves less — a warning, not a lock.

Do not let an AI model calculate authoritative totals.

## Prices
A price is meaningful only with enough context to identify:
- product
- retailer/store
- price
- currency
- package/unit
- effective/valid time
- source where applicable

For comparisons, prefer normalized unit price when package sizes differ.

## Promotions
A promotion is not automatically a good deal just because its percentage discount is large. The engine should consider:
- final price
- unit price
- historical price when available
- package size
- household need
- storage constraints
- expiry/validity
- budget impact

## Shopping list
A shopping list can contain:
- desired quantity
- unit
- product/category
- priority
- notes
- completion state
- optional preferred store

The system should be able to explain why an item is suggested or moved.

## Weekly plan
Meal plans should respect household preferences, exclusions, budget and practical constraints. A child-specific requirement must come from stored household/member data, not a hard-coded assumption.

## Bulk buying
Large quantities may be recommended when the savings are meaningful and the household can reasonably use/store the quantity. Do not optimize price alone.

## Location
Distance is one factor, not an automatic command to use the nearest store. Users must be able to choose stores manually.

## History
Past purchases are historical facts. They can inform recommendations but must not be rewritten merely because a current product price or product definition changes.


## Recipe cost and package standardization

Recipe cost is based on the quantity actually used:
- `g`/`kg` and `ml`/`l` are converted to the price's comparable unit;
- `ks` uses the per-piece price;
- the whole package price is never charged as the recipe cost unless the recipe actually consumes one whole package.

Kitchen measures are estimates, not exact retail units. A teaspoon or tablespoon may be interpreted as volume or as ingredient-specific mass. Ingredient-specific rules take precedence over generic volume rules. A pinch uses an ingredient-specific estimate where available and otherwise a clearly marked generic estimate. Ingredients such as "podle chuti" with no defensible quantity remain unpriced.

Package sizes are standardized separately from recipe quantities. The persistent `product_packages` catalog is authoritative when its stored size agrees with the current price context. Explicit package markers in the product name are the next evidence tier (including multipacks and explicit piece counts); weight/volume markers must agree with the current package price and comparable unit price before being used, while an explicit `N ks` marker is sufficient evidence for a piece-priced product. Verified name evidence is persisted back into `product_packages`; piece-count evidence is never inferred from a `ks` price alone. If neither persistent nor explicit evidence resolves the size, the system falls back to package price divided by comparable unit price. The result is canonicalized to `kg`, `l` or `ks` for comparison.

Every recipe price derived from a culinary estimate must remain identifiable as an estimate; the system must not present an estimated quantity as an exact measured fact.
## Recipe import quality gate

The scheduled recipe import must exclude recipes rated below **4.0/5.0**. If a source uses another rating scale, the importer normalizes it to a five-point scale before applying the threshold. Recipes without a rating are not rejected by this rule, because absence of a rating is not evidence of a low rating.
