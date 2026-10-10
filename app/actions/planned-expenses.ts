'use server'

import { randomUUID } from 'node:crypto'
import { and, asc, eq, gte, lt } from 'drizzle-orm'
import { requireHousehold, requireHouseholdId } from '@/lib/auth/authorize'
import { nextPeriodStartFor, periodStartFor } from '@/lib/budget-period'
import { notifyBudgetThresholds, periodSpending } from '@/lib/db/budget-notify'
import { getDb } from '@/lib/db/client'
import { loadPeriodConfig } from '@/lib/db/period-config'
import * as schema from '@/lib/db/schema'
import { validateExpenseInput } from '@/lib/expense-input'
import { isIsoDate } from '@/lib/income-input'
import { validatePlannedExpenseInput, type PlannedExpenseInput } from '@/lib/planned-expense-input'
import { todayInPrague } from '@/lib/today'
import type { Expense, Notification, PlannedExpense } from '@/lib/types'

// Planned expenses of the household's budget (docs/15_BUDGET_PERIODS.md §7–8). A planned expense is
// only expected money going out and never changes the actual balance. Paying it creates the real
// expense and links it, so the same money is never counted twice. Like app/actions/incomes.ts, nothing
// here revalidates the page; the budget view shows the returned rows from its own state.

type Row = typeof schema.plannedExpenses.$inferSelect

function toPlannedExpense(row: Row): PlannedExpense {
  return { id: row.id, amount: Number(row.amount), note: row.note, category: row.category, date: row.date, status: row.status === 'paid' ? 'paid' : 'planned' }
}

function validOrThrow(input: PlannedExpenseInput) {
  const result = validatePlannedExpenseInput(input)
  if ('error' in result) throw new Error(result.error)
  return result.plannedExpense
}

/** Loads one planned expense of the caller's household; any other id is "not found" (CLAUDE.md section 9). */
async function ownPlannedExpense(householdId: string, id: string): Promise<Row> {
  const row = await getDb().query.plannedExpenses.findFirst({ where: and(eq(schema.plannedExpenses.id, id), eq(schema.plannedExpenses.householdId, householdId)) })
  if (!row) throw new Error('Plánovaný výdaj nebyl nalezen.')
  return row
}

/** Every planned expense dated in one budget period (still planned and already paid), oldest first. */
export async function getPeriodPlannedExpensesAction(period: string): Promise<PlannedExpense[]> {
  const householdId = await requireHouseholdId()
  if (!isIsoDate(period)) throw new Error('Neplatné období.')
  const config = await loadPeriodConfig(getDb(), householdId)
  const from = periodStartFor(config, period)
  const rows = await getDb().query.plannedExpenses.findMany({
    where: and(eq(schema.plannedExpenses.householdId, householdId), gte(schema.plannedExpenses.date, from), lt(schema.plannedExpenses.date, nextPeriodStartFor(config, from))),
    orderBy: [asc(schema.plannedExpenses.date), asc(schema.plannedExpenses.createdAt)],
  })
  return rows.map(toPlannedExpense)
}

export async function addPlannedExpenseAction(input: PlannedExpenseInput): Promise<PlannedExpense> {
  const householdId = await requireHouseholdId()
  const planned = validOrThrow(input)
  const [row] = await getDb()
    .insert(schema.plannedExpenses)
    .values({ householdId, amount: planned.amount.toString(), note: planned.note, category: planned.category, date: planned.date })
    .returning()
  return toPlannedExpense(row)
}

/** Corrects a still-planned expense. A paid one is a real expense now and is corrected there. */
export async function updatePlannedExpenseAction(id: string, input: PlannedExpenseInput): Promise<PlannedExpense> {
  const householdId = await requireHouseholdId()
  const existing = await ownPlannedExpense(householdId, id)
  if (existing.status !== 'planned') throw new Error('Zaplacený výdaj se upravuje mezi výdaji.')
  const planned = validOrThrow(input)
  const [row] = await getDb()
    .update(schema.plannedExpenses)
    .set({ amount: planned.amount.toString(), note: planned.note, category: planned.category, date: planned.date })
    .where(and(eq(schema.plannedExpenses.id, id), eq(schema.plannedExpenses.householdId, householdId), eq(schema.plannedExpenses.status, 'planned')))
    .returning()
  if (!row) throw new Error('Tento výdaj už byl zaplacen.')
  return toPlannedExpense(row)
}

export async function deletePlannedExpenseAction(id: string): Promise<void> {
  const householdId = await requireHouseholdId()
  await ownPlannedExpense(householdId, id)
  await getDb().delete(schema.plannedExpenses).where(and(eq(schema.plannedExpenses.id, id), eq(schema.plannedExpenses.householdId, householdId), eq(schema.plannedExpenses.status, 'planned')))
}

/** The plan came true: it becomes a real expense on `paidDate` (today by default) in the amount
 *  actually paid (the planned one by default), with the budget's notifications. The plan is claimed
 *  first by an UPDATE that only matches a still-planned row, so two taps or two members at once cannot
 *  turn one plan into two expenses; if writing the expense then fails, the claim is undone. */
export async function payPlannedExpenseAction(
  id: string,
  paid?: { amount: number; date: string },
): Promise<{ expense: Expense; plannedExpense: PlannedExpense; notifications: Notification[] }> {
  const { householdId, userId } = await requireHousehold()
  const existing = await ownPlannedExpense(householdId, id)
  const result = validateExpenseInput(
    { amount: paid?.amount ?? Number(existing.amount), note: existing.note, category: existing.category, subcategory: null, date: paid?.date ?? todayInPrague() },
    todayInPrague(),
  )
  if ('error' in result) throw new Error(result.error)
  const expense = result.expense
  const db = getDb()
  const expenseId = randomUUID()
  const [claimed] = await db
    .update(schema.plannedExpenses)
    .set({ status: 'paid', expenseId: null })
    .where(and(eq(schema.plannedExpenses.id, id), eq(schema.plannedExpenses.householdId, householdId), eq(schema.plannedExpenses.status, 'planned')))
    .returning()
  if (!claimed) throw new Error('Tento výdaj už byl zaplacen.')
  const before = await periodSpending(db, householdId, expense.date)
  try {
    // The expense first, then the link: the link's foreign key needs the expense to exist.
    await db.insert(schema.expenses).values({ id: expenseId, householdId, amount: expense.amount.toString(), note: expense.note, category: expense.category, subcategory: expense.subcategory, date: expense.date })
    await db.update(schema.plannedExpenses).set({ expenseId }).where(eq(schema.plannedExpenses.id, id))
  } catch (error) {
    await db.update(schema.plannedExpenses).set({ status: 'planned' }).where(eq(schema.plannedExpenses.id, id))
    throw error
  }
  const notifications = await notifyBudgetThresholds(db, householdId, before, [{ category: expense.category, amount: expense.amount }], userId)
  return { expense: { id: expenseId, ...expense, purchaseId: null }, plannedExpense: toPlannedExpense({ ...claimed, expenseId }), notifications }
}
