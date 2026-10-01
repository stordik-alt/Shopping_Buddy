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

Package sizes are standardized separately from recipe quantities. When the source does not provide an explicit package size, it may be derived from package price and comparable unit price. The result is canonicalized to `kg`, `l` or `ks` for comparison.

Every recipe price derived from a culinary estimate must remain identifiable as an estimate; the system must not present an estimated quantity as an exact measured fact.
## Recipe import quality gate

The scheduled recipe import must exclude recipes rated below **4.0/5.0**. If a source uses another rating scale, the importer normalizes it to a five-point scale before applying the threshold. Recipes without a rating are also excluded from import.
