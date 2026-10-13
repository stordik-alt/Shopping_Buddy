'use server'

import { requireHousehold, requireHouseholdId } from '@/lib/auth/authorize'
import { getHouseholdExpenses, getHouseholdPurchaseHistory, getPantryItems } from '@/lib/db/queries'
import { getMemberIdForUser, getMemberStoreSelection } from '@/lib/db/member-store-preferences'
import { getRestockSuggestionsFor, getStockLevels } from '@/lib/db/restock'
import { EMPTY_STORE_SELECTION } from '@/lib/nearby-stores'
import type { RestockSuggestion, StockLevel } from '@/lib/pantry-restock'
import { todayInPrague } from '@/lib/today'
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

/** "Dokoupit do zásoby", recomputed for the signed-in member's current stores. The page computes it once when
 *  it loads, so after the member changes their (priority) stores it has to be asked for again. The
 *  household and the member come from the session. */
export async function refreshRestockSuggestionsAction(): Promise<RestockSuggestion[]> {
  const { householdId, userId } = await requireHousehold()
  const memberId = await getMemberIdForUser(userId)
  const [levels, pantryItems, selection] = await Promise.all([
    getStockLevels(householdId),
    getPantryItems(householdId),
    memberId ? getMemberStoreSelection(memberId) : Promise.resolve(EMPTY_STORE_SELECTION),
  ])
  return getRestockSuggestionsFor(levels, pantryItems, todayInPrague(), selection)
}
