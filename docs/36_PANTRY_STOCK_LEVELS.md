# 36 — Minimum and maximum stock ("Dokoupit do zásoby")

Status: implemented 2026-10-11. The owner: "možnost, aby si mohl uživatel u svých oblíbených typů potravin nastavit
minimální a maximální zásobu. Pokud se bude zásoba blížit k minimu a objeví se zajímavá akce, měla by mu aplikace
navrhnout, že je teď ten správný čas, aby si dokoupil do zásoby. Z řetězců, které má uložené jako prioritní, za co
nejnižší cenu."

## Data (changed 2026-10-12: per product type, set in the Profil)
Levels are no longer set on a single pantry row. The owner: "minimální a maximální množství se bude nastavovat v profilu,
ne v zásobách. Nechceme nastavovat minimální a maximální množství konkrétního produktu, ale typu produktu. Aby aplikace
mohla nabízet nejlevnější varianty."

Table `household_stock_levels` (migration `0099_household_stock_levels.sql`): `household_id`, `product_type_id`,
`min_quantity`, `max_quantity`, `unit`; unique per (household, type); check `0 <= min < max`. The migration copies the
levels set on pantry rows during the first day (by the row's or its product's type). `pantry_items.min_quantity` /
`max_quantity` stay in the schema but are no longer read or written (drop later, CLAUDE.md section 7).

## Rules (`lib/pantry-restock.ts`, pure)
1. The **stock of a type** is the sum of every pantry row of that type, in the level's unit (g/kg and ml/l convert;
   pieces of known size count by their size, 2 × 250 g = 0.5 kg; a row that cannot be expressed in the unit is left out,
   not guessed).
2. A type is **near its minimum** when `stock <= min × 1.25`.
3. The amount to buy is `max − stock` (whole pieces for `ks`).
4. A promotion belongs to a type when it is on **any product of that type** (`products.product_type_id`), not only the
   product the household usually buys.
5. Chains: the member's **priority chains**; when none are set, the chosen nearby chains; when none are chosen, any chain.
6. A promotion counts as interesting when its chain's regular price is known and it takes at least **10 %** off it
   (docs/05: a retailer's own percentage is not a good deal by itself). An offers-only chain (no regular price) is shown as
   an offer, with no invented discount.
7. The suggestion is the **cheapest** such promotion of the type: by price per unit when both state one in the same unit,
   otherwise by package price; ties by chain and product name. Types are listed most depleted first.

## Code
- `lib/db/restock.ts` `getStockLevels()` reads the household's levels; `getRestockCandidates()` reads running deals (with
  the latest regular price) only for the types near their minimum; `app/page.tsx` computes the suggestions on the server and
  passes them, with the levels, to the shell.
- `app/actions/pantry.ts` `setStockLevelAction()` / `removeStockLevelAction()`: household from the session, the type key and
  unit checked, levels validated again on the server; both return the household's levels.
- UI: Profil ▸ "Hlídané zásoby" (`components/household/stock-levels-settings.tsx`: type, minimum, maximum, unit);
  a "Dokoupit" badge on pantry rows of a type near the minimum; `components/dashboard/restock-card.tsx` on Domů names the
  type, the cheapest variant and the amount, and "Na seznam · 5 ks" adds **that product** to the list with that quantity
  (the shopping queue's `add` operation carries an optional `quantity` and `unit`).

## Not in scope
- A push/bell notification for a suggestion (could follow with docs/14 and docs/21).
- The suggestions are computed when the page loads; like the rest of the app they refresh on reload.
