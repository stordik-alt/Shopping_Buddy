'use server'

import { requireHouseholdId } from '@/lib/auth/authorize'
import type { PeriodHistoryRow } from '@/lib/budget-history'
import { getDb } from '@/lib/db/client'
import { loadPeriodConfig } from '@/lib/db/period-config'
import { loadPeriodHistory } from '@/lib/db/period-ledger'
import { todayInPrague } from '@/lib/today'

/** The household's past budget periods (docs/15_BUDGET_PERIODS.md §18). Read-only; the household is the
 *  caller's own, never a client-supplied id. */
export async function getPeriodHistoryAction(): Promise<PeriodHistoryRow[]> {
  const householdId = await requireHouseholdId()
  const db = getDb()
  const config = await loadPeriodConfig(db, householdId)
  return loadPeriodHistory(db, householdId, config, todayInPrague())
}
