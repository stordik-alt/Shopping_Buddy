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

Recipe culinary measures are normalized before pricing:
- exact units remain exact (`g`, `kg`, `ml`, `l`, `ks`);
- teaspoon/tablespoon can resolve either to volume or ingredient-specific mass;
- ingredient-specific estimates take precedence over generic volume estimates;
- pinch uses an ingredient-specific mass estimate when available, otherwise a small generic estimate;
- estimates are explicitly marked so the UI can distinguish estimated recipe cost from exact quantity data.

Retail package sizes are standardized at the domain layer. When an explicit package size is not stored, it can currently be derived from `regularPrice / unitPrice` and represented canonically as `kg`, `l` or `ks`. This is a runtime derivation until the product catalog has a first-class product-variant/package-size model.

Do not silently convert an imprecise culinary measure into a falsely exact quantity. If no reasonable estimate exists, the ingredient remains unpriced rather than inventing a price.
