'use server'

import { and, eq } from 'drizzle-orm'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { periodStartFor } from '@/lib/budget-period'
import { getDb } from '@/lib/db/client'
import { loadPeriodConfig } from '@/lib/db/period-config'
import { loadBudgetOutlook } from '@/lib/db/period-ledger'
import * as schema from '@/lib/db/schema'
import { isIsoDate } from '@/lib/income-input'
import { validatePlannedCarry } from '@/lib/planned-carry-input'
import { todayInPrague } from '@/lib/today'
import type { BudgetOutlook } from '@/lib/types'

// The outlook for the periods ahead and the transfer planned between them (docs/15_BUDGET_PERIODS.md
// §14, §16). Read-only apart from the plan, which is only a number: nothing here moves money.

/** The running period and a year of periods ahead, with the sums the outlook is calculated from. */
export async function getBudgetOutlookAction(): Promise<BudgetOutlook> {
  const householdId = await requireHouseholdId()
  const db = getDb()
  const config = await loadPeriodConfig(db, householdId)
  return loadBudgetOutlook(db, householdId, config, todayInPrague())
}

/** Plans (or, with a blank / zero amount, clears) what to leave for the next period when the period
 *  containing `period` ends. Only the running and later periods can be planned: a finished one is
 *  decided by closing it, which also removes the plan. */
export async function setPlannedCarryAction(period: string, amount: number | null): Promise<void> {
  const householdId = await requireHouseholdId()
  if (!isIsoDate(period)) throw new Error('Neplatné období.')
  const db = getDb()
  const config = await loadPeriodConfig(db, householdId)
  const today = todayInPrague()
  const valid = validatePlannedCarry({ periodStart: periodStartFor(config, period), amount }, periodStartFor(config, today))
  if ('error' in valid) throw new Error(valid.error)

  if (valid.amount === null) {
    await db.delete(schema.plannedCarries).where(and(eq(schema.plannedCarries.householdId, householdId), eq(schema.plannedCarries.periodStart, valid.periodStart)))
    return
  }
  await db
    .insert(schema.plannedCarries)
    .values({ householdId, periodStart: valid.periodStart, amount: valid.amount.toString() })
    .onConflictDoUpdate({ target: [schema.plannedCarries.householdId, schema.plannedCarries.periodStart], set: { amount: valid.amount.toString() } })
}
