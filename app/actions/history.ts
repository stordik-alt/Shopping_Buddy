'use server'

import { requireHouseholdId } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getHouseholdExpenses, getHouseholdPurchaseHistory } from '@/lib/db/queries'

/** Hydrates the full purchase history only when the Nákup history view is opened. */
export async function loadPurchaseHistoryAction() {
  const householdId = await requireHouseholdId()
  const household = await getDb().query.households.findFirst({ where: eq(schema.households.id, householdId), columns: { budgetPeriodStartDay: true } })
  return getHouseholdPurchaseHistory(householdId, household?.budgetPeriodStartDay ?? 1)
}

/** Hydrates the full expense history only when the Rozpočet history view is opened. */
export async function loadExpenseHistoryAction() {
  const householdId = await requireHouseholdId()
  const household = await getDb().query.households.findFirst({ where: eq(schema.households.id, householdId), columns: { budgetPeriodStartDay: true } })
  return getHouseholdExpenses(householdId, household?.budgetPeriodStartDay ?? 1)
}
