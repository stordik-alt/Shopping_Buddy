'use server'

import { requireHouseholdId } from '@/lib/auth/authorize'
import { getHouseholdExpenses, getHouseholdPurchaseHistory, getPantryItems } from '@/lib/db/queries'
import { getStockLevels } from '@/lib/db/restock'
import type { StockLevel } from '@/lib/pantry-restock'
import type { Expense, PantryItem, PurchaseRecord } from '@/lib/types'

// The "Obnovit" buttons of the sections (the shopping list has its own in app/actions/shopping.ts): each
// re-reads only what that section shows, so another member's changes appear without a reload that would
// send the user back to the start. Read-only; the household always comes from the session.

/** Zásoby: the pantry rows and the wanted stock per type, read fresh. */
export async function refreshPantryAction(): Promise<{ pantryItems: PantryItem[]; stockLevels: StockLevel[] }> {
  const householdId = await requireHouseholdId()
  const [pantryItems, stockLevels] = await Promise.all([getPantryItems(householdId), getStockLevels(householdId)])
  return { pantryItems, stockLevels }
}

/** Moje nákupy: the purchase history, read fresh. */
export async function refreshPurchasesAction(): Promise<PurchaseRecord[]> {
  return getHouseholdPurchaseHistory(await requireHouseholdId())
}

/** Rozpočet: the expenses of the current budget period, read fresh. */
export async function refreshExpensesAction(): Promise<Expense[]> {
  return getHouseholdExpenses(await requireHouseholdId())
}
