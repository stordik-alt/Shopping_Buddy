'use server'

import { and, asc, eq, gte, lt } from 'drizzle-orm'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { nextPeriodStartFor, periodStartFor } from '@/lib/budget-period'
import { getDb } from '@/lib/db/client'
import { loadPeriodConfig } from '@/lib/db/period-config'
import * as schema from '@/lib/db/schema'
import { isIsoDate, validateIncomeInput, validateReceivedDate, type IncomeInput } from '@/lib/income-input'
import { todayInPrague } from '@/lib/today'
import type { Income } from '@/lib/types'

// Incomes of the household's budget (docs/15_BUDGET_PERIODS.md §8). A planned income is only expected;
// receiving it flips the same row to 'actual', so it is never counted twice. Like app/actions/budget.ts,
// nothing here revalidates the page: the budget view shows the returned rows from its own state.

type IncomeRow = typeof schema.incomes.$inferSelect

function toIncome(row: IncomeRow): Income {
  return {
    id: row.id,
    amount: Number(row.amount),
    description: row.description,
    date: row.date,
    status: row.status === 'actual' ? 'actual' : 'planned',
  }
}

/** The input checked by lib/income-input.ts; its message is shown to the user as it is. */
function validOrThrow(input: IncomeInput) {
  const result = validateIncomeInput(input, todayInPrague())
  if ('error' in result) throw new Error(result.error)
  return result.income
}

/** Loads one income of the caller's household; any other id is "not found" (CLAUDE.md section 9: a
 *  client-supplied id never reaches another household's data). */
async function ownIncome(householdId: string, incomeId: string): Promise<IncomeRow> {
  const row = await getDb().query.incomes.findFirst({ where: and(eq(schema.incomes.id, incomeId), eq(schema.incomes.householdId, householdId)) })
  if (!row) throw new Error('Příjem nebyl nalezen.')
  return row
}

/** Every income dated in one budget period (planned and received), oldest first. `period` may be any
 *  date inside it: it is normalised to the household's own period start. */
export async function getPeriodIncomesAction(period: string): Promise<Income[]> {
  const householdId = await requireHouseholdId()
  if (!isIsoDate(period)) throw new Error('Neplatné období.')
  const config = await loadPeriodConfig(getDb(), householdId)
  const from = periodStartFor(config, period)
  const rows = await getDb().query.incomes.findMany({
    where: and(eq(schema.incomes.householdId, householdId), gte(schema.incomes.date, from), lt(schema.incomes.date, nextPeriodStartFor(config, from))),
    orderBy: [asc(schema.incomes.date), asc(schema.incomes.createdAt)],
  })
  return rows.map(toIncome)
}

export async function addIncomeAction(input: IncomeInput): Promise<Income> {
  const householdId = await requireHouseholdId()
  const income = validOrThrow(input)
  const [row] = await getDb()
    .insert(schema.incomes)
    .values({ householdId, amount: income.amount.toString(), description: income.description, date: income.date, status: income.status })
    .returning()
  return toIncome(row)
}

/** Corrects an income's amount, description or date. Its status changes only by receiving it
 *  (markIncomeReceivedAction), never by an edit, so a received income cannot silently turn back
 *  into a plan. */
export async function updateIncomeAction(incomeId: string, input: Omit<IncomeInput, 'status'>): Promise<Income> {
  const householdId = await requireHouseholdId()
  const existing = await ownIncome(householdId, incomeId)
  const income = validOrThrow({ ...input, status: existing.status })
  const [row] = await getDb()
    .update(schema.incomes)
    .set({ amount: income.amount.toString(), description: income.description, date: income.date })
    .where(and(eq(schema.incomes.id, incomeId), eq(schema.incomes.householdId, householdId)))
    .returning()
  return toIncome(row)
}

export async function deleteIncomeAction(incomeId: string): Promise<void> {
  const householdId = await requireHouseholdId()
  await ownIncome(householdId, incomeId)
  await getDb().delete(schema.incomes).where(and(eq(schema.incomes.id, incomeId), eq(schema.incomes.householdId, householdId)))
}

/** Marks a planned income as received on `receivedDate` (today by default), keeping the same row.
 *  Only a still-planned income can be received: the status check is in the UPDATE itself, so two
 *  taps or two members at once cannot turn one plan into two received incomes. */
export async function markIncomeReceivedAction(incomeId: string, receivedDate?: string): Promise<Income> {
  const householdId = await requireHouseholdId()
  await ownIncome(householdId, incomeId)
  const today = todayInPrague()
  const date = receivedDate ?? today
  const dateError = validateReceivedDate(date, today)
  if (dateError) throw new Error(dateError)
  const [row] = await getDb()
    .update(schema.incomes)
    .set({ status: 'actual', date })
    .where(and(eq(schema.incomes.id, incomeId), eq(schema.incomes.householdId, householdId), eq(schema.incomes.status, 'planned')))
    .returning()
  if (!row) throw new Error('Tento příjem už byl přijat.')
  return toIncome(row)
}
