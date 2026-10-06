# Deleting a purchase (a receipt) — concept

Status: **implemented 2026-10-06** (owner request and decisions of the same day).

## 1. Problem

Receipts imported while trying the app out stay in the history and in the budget. Rozpočet's past periods
(`docs/15_BUDGET_PERIODS.md`) count every finished period that has any spending, measured against the default
budget, so a test period with two small receipts shows almost the whole budget as "ušetřeno" and inflates
"Ušetřeno celkem". The owner: *"Chceme do sekce Moje účtenky možnost odstranit účtenku. Aplikace započítává úspory
z předešlých období, kdy se zkoušeli zkušební účtenky."* Nothing could be deleted.

A period whose only purchases are deleted has no spending left and drops out of the past periods, so deleting the
test receipts corrects the savings.

## 2. Owner decisions (2026-10-06)

- **Every purchase** in Nákup ▸ Moje nákupy can be deleted — from a receipt, entered by hand, or completed from the
  shopping list.
- **Pantry**: what the purchase put into Zásoby is taken out again.
- **Shopping list**: no duplicates may appear — *"pokud mám položky na seznamu a odškrtnou se tím ze seznamu, nesmí
  vzniknout duplicity"*.

## 3. What deleting a purchase does

One server action (`deletePurchaseAction`, `lib/db/purchase-deletion.ts`); the household comes from the session and
the purchase must be its own.

1. **Shopping list**: the items this purchase's receipt ticked off (`shopping_list_items.checked_by_purchase_id`)
   and that are still on a list are unticked — the same rows, nothing is added, so no duplicate can appear. Items a
   completed list purchase removed from the list stay removed (adding them back would duplicate what the household
   has re-added since).
2. **Purchase, its lines, their expense splits and its expenses** are deleted (`expenses.purchase_id` and
   `purchase_items.purchase_id` cascade), so the budget, the category split and the past periods' savings follow.
3. **Receipt**: its `receipt_imports` row is deleted — the same receipt can be uploaded again without being taken for
   a duplicate — and the stored photo is removed (best effort, logged on failure).
4. **Pantry**: for each line, the matching pantry row (by product, else by name, the same match a restock uses) in
   the same unit loses the line's quantity; a row that reaches zero is removed. A line in another unit, a
   non-inventory line (bag, deposit) and a line with no pantry row are left alone — never a guess.

The list, purchase and receipt changes go to the database in one atomic batch; the pantry follows.

## 4. Not changed

- **Price observations** from the receipt stay: they carry no link to the purchase, and a price seen on a real shelf
  remains true even when the purchase was only a test.
- Products and aliases the receipt created, and notifications already sent, stay.

## 5. UI

Moje nákupy ▸ an opened purchase ▸ "Odstranit nákup". A confirmation in place says what happens (výdaje, účtenka,
zásoby, odškrtnuté položky). After deleting, the screen reloads the household's data, and Rozpočet's past periods
are loaded again.
