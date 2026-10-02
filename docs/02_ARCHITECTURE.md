# Shopping Buddy — Architecture

## Target architecture
Shopping Buddy remains a Next.js + React + TypeScript application with Neon PostgreSQL as the persistent relational data store.

High-level flow:

UI
-> application/domain logic
-> typed server-side data access
-> Neon PostgreSQL

AI and optimization engines sit above the same structured domain layer. They must not become an alternative source of truth.

## Principles
- Server-side access to Neon for protected/persistent operations.
- Typed domain models shared carefully between UI and server.
- Business calculations in reusable TypeScript modules, not duplicated in components.
- Database constraints enforce important invariants where practical.
- Authorization is enforced server-side; UI hiding is not security.
- Use transactions for multi-table operations that must be atomic.
- Prefer migrations over manual production edits.
- Keep external retailer integrations behind adapters.

## Suggested layers
`app/`
Routes, pages and route handlers.

`components/`
Reusable presentation/UI components.

`lib/domain/`
Pure business rules and calculations.

`lib/data/`
Typed data-access/repository functions for Neon.

`lib/validators/`
Input validation and schemas.

`lib/integrations/`
Retailer, geolocation and future external-service adapters.

The exact folder structure may differ if the existing code already has an equivalent. Do not create duplicate abstractions merely to match this document.

## Data ownership
Most shopping data should be scoped to a household. User-specific data belongs to a user. Shared data must be accessible only to authorized household members.

## Retailer adapter concept
Core code should work with a generic retailer model:
- retailer identity
- store location
- product mapping
- price source
- promotion source
- effective dates
- country/currency

Adapters can later integrate public APIs, licensed feeds, retailer pages or other permitted sources. No bypassing access controls.

## AI architecture
AI receives structured, validated context from the application. It can explain, suggest and assist. Deterministic systems decide:
- arithmetic
- budget totals
- price comparisons
- distances
- eligibility
- promotion validity
- optimization constraints

The AI must never invent a price, promotion, store availability or purchase record.

## Global readiness
Do not prematurely internationalize every UI string, but database and domain models should avoid assumptions that make additional countries impossible.

At minimum plan for:
- country
- currency
- locale/language
- retailer
- unit conventions
- timezone


## Recipe pricing and packaging standardization — 2026-10-01

Recipe cost calculation uses the actual amount consumed, not the price of the whole retail package. A stored product price contains a package price and a comparable unit price; the recipe cost engine multiplies the consumed quantity by that unit price.
Package sizes are backed by the shared `product_packages` catalog. Price/search queries resolve a catalog size only when it agrees with the current observation's package/unit-price ratio; otherwise they retain the derived runtime size as a fallback. Shopping-plan whole-package purchasing uses that resolved size.


Recipe culinary measures are normalized before pricing:
- exact units remain exact (`g`, `kg`, `ml`, `l`, `ks`);
- teaspoon/tablespoon can resolve either to volume or ingredient-specific mass;
- ingredient-specific estimates take precedence over generic volume estimates;
- pinch uses an ingredient-specific mass estimate when available, otherwise a small generic estimate;
- estimates are explicitly marked so the UI can distinguish estimated recipe cost from exact quantity data.

Retail package sizes are standardized at the domain layer. The resolver checks the persistent `product_packages` catalog first, then explicit package markers in the product name (including multipacks such as `8x 100 g` and piece counts such as `10 ks`) when they agree with the current price context, and finally derives a size from `regularPrice / unitPrice`. Weight/volume name evidence must stay within a small tolerance of the price ratio; piece counts are accepted only when the name explicitly states `N ks`. All sizes are represented canonically as `kg`, `l` or `ks`.

Do not silently convert an imprecise culinary measure into a falsely exact quantity. If no reasonable estimate exists, the ingredient remains unpriced rather than inventing a price.
