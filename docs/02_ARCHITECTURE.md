# Shopping Buddy — Architecture

## Target architecture
Shopping Buddy remains a Next.js + React + TypeScript application with Neon PostgreSQL as the persistent relational data store.

## Gradual native-app path

The existing Next.js PWA remains at the repository root and stays independently buildable. The minimal Expo application lives at `apps/mobile`; narrowly selected platform-neutral code lives in `packages/shared`. Moving the PWA is not a prerequisite. The root pnpm project remains the web application, and the workspace globs include both apps and packages without changing current framework or pnpm versions.

`packages/shared` is limited to code safe in both browser and native environments, such as pure deterministic utilities and platform-neutral types. It must not contain server-only code, secrets, authorization decisions, database access, Next.js APIs, or UI components tied to either React DOM or React Native. Keep platform-specific UI in each app. Before adding native business functionality, verify the Expo/React Native combination against the existing React version rather than upgrading the web stack implicitly.

### Pure business-logic audit — 2026-10-17

The first extraction is intentionally limited to `ItemUnit`, `ITEM_UNITS`, and `unitLabel` from `lib/types.ts` / `lib/units.ts`. These have no runtime dependencies and can be imported by either app. The PWA keeps its existing `lib/units` entry point as an adapter, while `lib/types` re-exports the type; current call sites and database-enum checks therefore keep their existing contract. Dose-based product defaults remain in the PWA adapter because they depend on the PWA's product-type keys.

The other requested areas are not part of this first move:

- Input checks such as `lib/shopping-input.ts` are pure, but mix reusable constraints with PWA-specific Czech errors and database-enum parity; split those concerns behind an adapter before moving them.
- Quantity conversions and package-size resolution (`lib/meal-plans.ts`, `lib/quantity-normalization.ts`, `lib/inventory-packaging.ts`, and recipe packaging/measurement modules) encode distinct product and recipe rules and have broader callers. Extract only after defining platform-neutral inputs and parity fixtures.
- Budget arithmetic is deterministic (`lib/budget-balances.ts`), but budget-period/date rules and adjacent functions carry established domain contracts. Keep them in place until a focused extraction can preserve those contracts with direct parity tests.
- Product category/subcategory classification (`lib/product-subcategories.ts` and `lib/categorization.ts`) depends on product normalization, brand rules, catalog data, and—in one narrow fallback—AI. It is not a safe bulk move.

No React, HTML, CSS, DOM, Next.js server function, database access, or AI integration is included in `packages/shared`.

### Native shopping-list vertical slice — 2026-10-17

`apps/mobile` now provides a native shopping-list screen over the existing application backend. The app uses the existing Neon Auth route, then calls `/api/mobile/shopping-list` with a bearer token. The route resolves the user and household on the server; list reads and writes use the same database and `lib/shopping-list-service.ts` operations as the PWA Server Actions. Quantity, unit and completion changes therefore keep the existing validation and household ownership checks. The mobile client does not connect to Neon directly, accept household identifiers, or keep a parallel list store.

The native app owns only presentation and transport state. The only business primitive shared across PWA and native code remains the platform-neutral item-unit vocabulary and label helper in `packages/shared`.

### Native budget and pantry screens — 2026-10-17

The Expo app adds household-scoped budget reporting and place-based pantry browsing with quantity/place corrections. Its bearer-authenticated Route Handlers resolve membership server-side and query the same Neon records as the PWA. Budget periods and category totals come from `lib/budget.ts`; pantry writes use `lib/pantry-mobile-mutations.ts`, shared with existing PWA Server Actions. The API does not accept a household ID, create purchase/expense records for stock corrections, or introduce tables/migrations. Budget and pantry domain logic remain in the application because the existing audit found their contracts unsuitable for bulk extraction to `packages/shared`.

### Native recipe catalog slice — 2026-10-17

The Expo app searches and opens recipes through bearer-authenticated `/api/mobile/recipes` endpoints. They query the existing `recipe_catalog` and recipe services, and opening a recipe updates the existing household recipe history. Thumbnails use the authenticated `/api/recipes/images/[id]` route to read the existing private `recipe-images/` objects in R2; source-site images are never loaded by the native client. The image route accepts either its existing PWA session or a verified mobile bearer token and restricts reads to the recipe-image key format. No second recipe catalog, image store, or import pipeline is introduced.

### Native meal planning and portions — 2026-10-17

The Expo meal-planning screen uses household-scoped `/api/mobile/meal-plan` and `/api/mobile/meal-plan/servings` Route Handlers. They derive the household from the verified user, reuse existing household-filtered recipe pools and pantry records, and read/write the same weekly `meal_plans` snapshot as the PWA. Plan generation accepts only validated options; the server owns recipe selection and persistence. Both clients update portions through `setMealServings` in `lib/meal-plans.ts`, which preserves the snapshot format and bounds portions to 0–1000; ingredient scaling remains `plannedRecipeIngredients`. No schema migration or native-specific domain copy is added.

### Native barcode lookup — 2026-10-17

The Expo shopping screen opens `expo-camera` only after the user explicitly starts scanning and grants camera permission. `/api/mobile/barcode` verifies the mobile bearer and household, validates the GTIN check digit, and requests only a product name from the fixed Open Food Facts API with a timeout and bounded response. The returned name is added through the existing mobile shopping-list endpoint and service, preserving product matching and list persistence. The scanned code is not stored: `products` currently has no barcode column, and scanning does not create a parallel product catalog. Camera audio permissions are disabled.

### Native receipt import — 2026-10-17

The Expo receipt screen captures a photo only after the user opens the camera and grants permission. Bearer-authenticated `/api/mobile/receipts` routes resolve household membership server-side and use the same upload validation, 24-hour limits, private R2 storage, `receipt_imports` state, atomic processing claim, OCR rate limits, and deterministic receipt pipeline as the PWA. The mobile screen can retry failed or abandoned processing and displays review/duplicate states, but never confirms uncertain OCR or creates a purchase from an unreviewed receipt; final correction and confirmation remain in the existing web review UI. No migration, second receipt store, or parallel OCR pipeline is added.

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

Retail package sizes are standardized at the domain layer. The resolver checks the persistent `product_packages` catalog first, then explicit package markers in the product name (including multipacks such as `8x 100 g` and piece counts such as `10 ks`) when they agree with the current price context, and finally derives a size from `regularPrice / unitPrice`. Weight/volume name evidence must stay within a small tolerance of the price ratio; verified weight/volume evidence is promoted into the persistent catalog for future resolutions. Explicit piece counts are also promoted into the persistent catalog, but only from the product-name marker itself; piece-priced rows never infer a count from price. All sizes are represented canonically as `kg`, `l` or `ks`.

Do not silently convert an imprecise culinary measure into a falsely exact quantity. If no reasonable estimate exists, the ingredient remains unpriced rather than inventing a price.
