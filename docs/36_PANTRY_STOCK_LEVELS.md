# 36 — Minimum and maximum stock ("Dokoupit do zásoby")

Status: implemented 2026-10-11. The owner: "možnost, aby si mohl uživatel u svých oblíbených typů potravin nastavit
minimální a maximální zásobu. Pokud se bude zásoba blížit k minimu a objeví se zajímavá akce, měla by mu aplikace
navrhnout, že je teď ten správný čas, aby si dokoupil do zásoby. Z řetězců, které má uložené jako prioritní, za co
nejnižší cenu."

## Data
`pantry_items.min_quantity` / `max_quantity` (numeric(10,3), nullable, in the row's own `unit`). Constraint
`pantry_items_stock_levels_check`: both null, or `0 <= min < max`. Migration `0098_pantry_stock_levels.sql` is additive;
a row without levels behaves exactly as before. A row kept by product type (Zásoby by type) is the "favourite type":
the levels sit on that row.

## Rules (`lib/pantry-restock.ts`, pure)
1. A row is **near its minimum** when it has levels, is not tracked as "Nesledovat" and `quantity <= min × 1.25`.
2. The amount to buy is `max − quantity` (whole pieces for `ks`).
3. A promotion belongs to a row when it is on the row's own product, or on any product of the row's type
   (`products.product_type_id`, matched by the type key).
4. Chains: the member's **priority chains**; when none are set, the chosen nearby chains; when none are chosen, any chain.
5. A promotion counts as interesting when its chain's regular price is known and it takes at least **10 %** off it
   (docs/05: a retailer's own percentage is not a good deal by itself). An offers-only chain (no regular price) is shown as
   an offer, with no invented discount.
6. The suggestion is the cheapest such promotion: by price per unit when both state one in the same unit, otherwise by
   package price; ties by chain and product name. Rows are listed most depleted first.

## Code
- `lib/db/restock.ts` `getRestockCandidates()` reads running deals (with the latest regular price) only when some row is
  near its minimum; `app/page.tsx` computes the suggestions on the server and passes them to the shell.
- `app/actions/pantry.ts` `setPantryStockLevelsAction()`: household from the session, ownership checked, levels validated
  again on the server.
- UI: Zásoby ▸ row ▸ pencil ▸ "Hlídat zásobu" (minimum/maximum), a "Dokoupit" badge on rows near the minimum;
  `components/dashboard/restock-card.tsx` on Domů with "Na seznam".

## Not in scope
- A push/bell notification for a suggestion (could follow with docs/14 and docs/21).
- The suggestions are computed when the page loads; like the rest of the app they refresh on reload.
