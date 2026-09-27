import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { isExpenseCategory, isValidSubcategory, type ExpenseCategory } from '@/lib/expense-categories'
import { splitPurchaseByCategory, type PurchaseExpenseLine } from '@/lib/purchase-expenses'

// Lets a household reassign one purchase-item's expense category by hand — e.g. a gift bought
// during an otherwise ordinary grocery trip, counted under Ostatní ▸ Dárky instead of Potraviny
// (owner request, 2026-09-27). Authorization is the caller's job (app/actions/purchases.ts resolves
// the household from the session).

export class PurchaseNotFoundError extends Error {}
export class InvalidExpenseCategoryError extends Error {}

/** Recomputes and replaces a purchase's expense rows (`expenses` where `purchase_id = purchaseId`)
 *  from its current items, honouring each item's own override where it has one
 *  (`splitPurchaseByCategory`, lib/purchase-expenses.ts). Called after any change to those overrides,
 *  and shares its output shape with the original split at purchase creation
 *  (app/actions/receipts.ts's `recordPurchaseExpenses`) so the two never diverge.
 *
 *  Deliberately does not re-check the household's budget thresholds: a reassignment moves money
 *  between categories of the *same* purchase and date, so the month's total is unchanged — only a
 *  per-category budget could in principle newly cross 80 %/100 % by this, which is not re-evaluated
 *  here (a known, accepted gap, not a silent one). */
export async function recomputePurchaseExpenses(db: ReturnType<typeof getDb>, purchaseId: string): Promise<void> {
  const purchase = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, purchaseId), columns: { householdId: true, date: true, total: true } })
  if (!purchase) throw new PurchaseNotFoundError('Nákup neexistuje.')
  const items = await db.query.purchaseItems.findMany({
    where: eq(schema.purchaseItems.purchaseId, purchaseId),
    columns: { price: true, quantity: true, category: true, expenseCategory: true, expenseSubcategory: true },
  })
  // An item without a known category (a purchase made before that column existed) contributes
  // nothing usable to the split — CLAUDE.md section 5: its original category was never kept, so
  // nothing invents one for it now.
  const lines: PurchaseExpenseLine[] = items
    .filter((item): item is typeof item & { category: NonNullable<(typeof item)['category']> } => item.category != null)
    .map((item) => ({
      category: item.category,
      amount: Number(item.price) * item.quantity,
      expenseOverride: item.expenseCategory ? { category: item.expenseCategory, subcategory: item.expenseSubcategory } : null,
    }))
  const parts = splitPurchaseByCategory(lines, Number(purchase.total))

  // The note text (e.g. "Nákup Lidl") is whatever the purchase's expenses already carried; reused
  // rather than re-derived, so a reassignment cannot accidentally change it.
  const existingNote = (await db.query.expenses.findFirst({ where: eq(schema.expenses.purchaseId, purchaseId), columns: { note: true } }))?.note ?? 'Nákup z účtenky'

  if (parts.length === 0) {
    await db.delete(schema.expenses).where(eq(schema.expenses.purchaseId, purchaseId))
    return
  }
  // One batch: the purchase never has zero or a stale mix of expense rows in between.
  await db.batch([
    db.delete(schema.expenses).where(eq(schema.expenses.purchaseId, purchaseId)),
    db.insert(schema.expenses).values(
      parts.map((part) => ({
        householdId: purchase.householdId,
        purchaseId,
        date: purchase.date,
        category: part.category,
        subcategory: part.subcategory,
        amount: part.amount.toString(),
        note: existingNote,
      })),
    ),
  ])
}

/** Sets (or clears, with `category: null`) one purchase-item's expense-category override and
 *  recomputes the purchase's expenses to match. Throws if the item does not belong to `householdId`'s
 *  own purchase, or if the category/subcategory pair is not valid (CLAUDE.md section 9: never trust
 *  client input). */
export async function setPurchaseItemExpenseOverride(
  householdId: string,
  purchaseItemId: string,
  target: { category: ExpenseCategory; subcategory: string | null } | null,
): Promise<void> {
  if (target) {
    if (!isExpenseCategory(target.category)) throw new InvalidExpenseCategoryError('Neplatná kategorie výdaje.')
    if (!isValidSubcategory(target.category, target.subcategory)) throw new InvalidExpenseCategoryError('Neplatná podkategorie výdaje.')
  }
  const db = getDb()
  const item = await db.query.purchaseItems.findFirst({
    where: eq(schema.purchaseItems.id, purchaseItemId),
    columns: { purchaseId: true },
    with: { purchase: { columns: { householdId: true } } },
  })
  if (!item || item.purchase.householdId !== householdId) throw new PurchaseNotFoundError('Položka nákupu neexistuje.')

  await db
    .update(schema.purchaseItems)
    .set({ expenseCategory: target?.category ?? null, expenseSubcategory: target?.subcategory ?? null })
    .where(eq(schema.purchaseItems.id, purchaseItemId))
  await recomputePurchaseExpenses(db, item.purchaseId)
}
