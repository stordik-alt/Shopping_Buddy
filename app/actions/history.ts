'use server'

import { requireHouseholdId } from '@/lib/auth/authorize'
import { getHouseholdExpenses, getHouseholdPurchaseHistory } from '@/lib/db/queries'

/** Hydrates the full purchase history only when the Nákup history view is opened. */
export async function loadPurchaseHistoryAction() {
  const householdId = await requireHouseholdId()
  return getHouseholdPurchaseHistory(householdId)
}

/** Hydrates the full expense history only when the Rozpočet history view is opened. */
export async function loadExpenseHistoryAction() {
  const householdId = await requireHouseholdId()
  return getHouseholdExpenses(householdId)
}
