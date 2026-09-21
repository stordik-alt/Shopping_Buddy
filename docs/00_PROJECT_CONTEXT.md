# Shopping Buddy — Project Context

## Product
Shopping Buddy is a family shopping assistant. Its purpose is to help a household plan and execute cheaper, more practical food shopping using household preferences, budget, nearby/selected stores, current prices and promotions, shopping history and eventually AI-assisted recommendations.

The product should be useful first in the Czech Republic and architected so it can later support additional countries.

## Core user value
The application should be able to:
- maintain a household/family profile
- store adults and children and relevant shopping preferences
- maintain favorite and excluded foods/products
- maintain a monthly budget
- maintain selected retailers and optionally discover nearby stores using location
- build shopping lists
- create weekly shopping/meal plans
- compare real prices and promotions
- record purchases and expenses
- learn from purchase history
- eventually optimize where and when to buy
- provide an AI assistant grounded in real structured application data

## Personalization
Preferences are user/household data, not hard-coded constants. They must be editable.

Examples:
- household size
- children and age-related needs
- favorite foods
- foods/products to avoid
- preferred brands where relevant
- budget
- preferred stores
- shopping frequency
- storage/freezer constraints
- willingness to buy larger quantities when a promotion is unusually good

## Retailers
Initial Czech retailer targets include Lidl, Albert, Kaufland, Billa, JIP and Penny. The architecture must not hard-code these names into core shopping algorithms. Retailers should be represented as data and connected through adapters/providers.

## Location
Location is optional and permission-based. The application may use browser/device geolocation to find nearby stores. The user must also be able to select stores manually.

## Long-term product
Roadmap stages:
1. stable frontend
2. family profile/household
3. smart shopping list
4. weekly shopping and meal plan
5. stores/location
6. prices/deals
7. budget/expenses
8. purchase history
9. backend/database
10. shared household
11. Smart Shopping Engine
12. notifications
13. global version
14. AI Shopping Assistant (deliberately last — see `docs/04_ROADMAP.md` Phase G; real AI integration has an ongoing per-call cost via the Vercel AI Gateway, and the owner wants every other stage's foundations solid first)
15. final product

The frontend stages are substantially implemented as a prototype. The current project focus is making the data model and Neon persistence real and reliable.

## Non-goals
Do not turn the application into a generic chatbot. AI is a layer over structured product, price, store, household, budget and purchase data.
