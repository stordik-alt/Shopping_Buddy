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
