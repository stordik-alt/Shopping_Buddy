# Shopping Buddy — AI Rules

## Role
The AI Shopping Assistant is an interface and reasoning layer over verified application data.

## Allowed
- interpret natural-language requests
- suggest shopping-list changes
- explain price differences
- explain budget implications
- suggest meals
- summarize household shopping patterns
- propose alternatives
- ask clarifying questions when required data is missing

## Not allowed
The AI must not invent:
- prices
- promotions
- store stock
- store opening status
- household members
- purchase history
- budget totals
- product availability

If data is missing, say that it is missing or request a data source.

## Deterministic calculations
These remain application/domain logic:
- totals
- currency arithmetic
- unit-price calculations
- distance calculations
- budget remaining
- promotion validity
- eligibility rules
- optimization constraints

## Grounding
AI prompts should receive structured context with identifiers and source metadata where useful. The model should not be asked to infer facts that the database already knows.

## Safety and privacy
Only provide the model the minimum household data needed for the task. Do not expose secrets or unrelated personal information.

## Future extensibility
The AI provider/model should be replaceable. Do not couple core shopping logic to one model vendor.
