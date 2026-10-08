'use server'

import { and, asc, eq, gte, lt, sql } from 'drizzle-orm'
import { requireHousehold, requireHouseholdId } from '@/lib/auth/authorize'
import { nextPeriodStart, periodStart } from '@/lib/budget'
import { periodSpending, notifyBudgetThresholds } from '@/lib/db/budget-notify'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { isExpenseCategory } from '@/lib/expense-categories'
import { validateExpenseInput, type ExpenseInput } from '@/lib/expense-input'
import { todayInPrague } from '@/lib/today'
import type { CategoryBudgets, Expense, Notification } from '@/lib/types'

// No revalidatePath in this file: each of these saves is already shown by components/app-shell.tsx from its
// own state or from the data the action returns. Re-rendering the whole page after every save re-ran
// every household query and re-sent the result (Neon network transfer) and, at worst, reset the view.

type ExpenseRow = typeof schema.expenses.$inferSelect

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    amount: Number(row.amount),
    note: row.note,
    category: row.category,
    subcategory: row.subcategory,
    date: row.date,
    purchaseId: row.purchaseId,
    productId: row.productId,
    productTypeId: row.productTypeId,
  }
}

/** The input checked by lib/expense-input.ts; its message is shown to the user as it is. */
function validOrThrow(input: ExpenseInput) {
  const result = validateExpenseInput(input, todayInPrague())
  if ('error' in result) throw new Error(result.error)
  return result.expense
}

/** Loads one expense of the caller's household that may be changed by hand; any other id is "not
 *  found" (CLAUDE.md section 9: a client-supplied id never reaches another household's data). A
 *  receipt's expense is its purchase's amount (lib/purchase-expenses.ts) and is not edited here. */
async function ownEditableExpense(householdId: string, expenseId: string): Promise<ExpenseRow> {
  const row = await getDb().query.expenses.findFirst({ where: and(eq(schema.expenses.id, expenseId), eq(schema.expenses.householdId, householdId)) })
  if (!row) throw new Error('Výdaj nebyl nalezen.')
  if (row.purchaseId) throw new Error('Výdaj z účtenky se upravuje s nákupem, ne ručně.')
  return row
}

async function resolveManualProductTypeId(key: string): Promise<string> {
  const row = await getDb().query.productTypes.findFirst({ where: eq(schema.productTypes.key, key), columns: { id: true } })
  if (!row) throw new Error('Neplatný druh zboží.')
  return row.id
}

async function resolveManualProductId(productId: string): Promise<string> {
  const row = await getDb().query.products.findFirst({ where: eq(schema.products.id, productId), columns: { id: true } })
  if (!row) throw new Error('Neplatný produkt.')
  return row.id
}

export async function addExpenseAction(input: ExpenseInput): Promise<{ expense: Expense; notifications: Notification[] }> {
  const { householdId, userId } = await requireHousehold()
  const expense = validOrThrow(input)
  const db = getDb()
  if (expense.selection?.kind === 'product') await resolveManualProductId(expense.selection.productId)
  // The budget and the category limits are monthly, so the 80 % / 100 % thresholds are checked
  // against the spending of the month the new expense falls in — not every expense ever recorded.
  const before = await periodSpending(db, householdId, expense.date)

  const [row] = await db
    .insert(schema.expenses)
    .values({
      householdId,
      amount: expense.amount.toString(),
      note: expense.note,
      category: expense.category,
      subcategory: expense.subcategory,
      date: expense.date,
      productId: expense.selection?.kind === 'product' ? expense.selection.productId : null,
      productTypeId: expense.selection?.kind === 'type' ? await resolveManualProductTypeId(expense.selection.productTypeKey) : null,
    })
    .returning()

  const notifications = await notifyBudgetThresholds(db, householdId, before, [{ category: expense.category, amount: expense.amount }], userId)
  return { expense: toExpense(row), notifications }
}

/** Corrects an expense: amount, category, subcategory, note or date. The budget notifications are
 *  not re-sent — they mark the moment spending crossed a threshold, which a correction does not. */
export async function updateExpenseAction(expenseId: string, input: ExpenseInput): Promise<{ expense: Expense }> {
  const householdId = await requireHouseholdId()
  await ownEditableExpense(householdId, expenseId)
  const expense = validOrThrow(input)
  if (expense.selection?.kind === 'product') await resolveManualProductId(expense.selection.productId)
  const [row] = await getDb()
    .update(schema.expenses)
    .set({
      amount: expense.amount.toString(),
      note: expense.note,
      category: expense.category,
      subcategory: expense.subcategory,
      date: expense.date,
      productId: expense.selection?.kind === 'product' ? expense.selection.productId : null,
      productTypeId: expense.selection?.kind === 'type' ? await resolveManualProductTypeId(expense.selection.productTypeKey) : null,
    })
    .where(and(eq(schema.expenses.id, expenseId), eq(schema.expenses.householdId, householdId)))
    .returning()
  return { expense: toExpense(row) }
}

export async function deleteExpenseAction(expenseId: string): Promise<void> {
  const householdId = await requireHouseholdId()
  await ownEditableExpense(householdId, expenseId)
  await getDb().delete(schema.expenses).where(and(eq(schema.expenses.id, expenseId), eq(schema.expenses.householdId, householdId)))
}

/** Sets a category's monthly limit, or removes it (`amount` null). Any member may, as with the overall
 *  monthly budget. Returns every limit of the household. */
export async function setCategoryBudgetAction(category: string, amount: number | null): Promise<CategoryBudgets> {
  const householdId = await requireHouseholdId()
  if (!isExpenseCategory(category)) throw new Error('Neznámá kategorie výdaje.')
  const db = getDb()
  if (amount === null) {
    await db.delete(schema.expenseCategoryBudgets).where(and(eq(schema.expenseCategoryBudgets.householdId, householdId), eq(schema.expenseCategoryBudgets.category, category)))
  } else {
    if (!Number.isFinite(amount) || amount <= 0 || amount > 99_999_999.99) throw new Error('Limit musí být částka větší než 0.')
    const value = (Math.round(amount * 100) / 100).toString()
    await db
      .insert(schema.expenseCategoryBudgets)
      .values({ householdId, category, amount: value })
      .onConflictDoUpdate({ target: [schema.expenseCategoryBudgets.householdId, schema.expenseCategoryBudgets.category], set: { amount: value, updatedAt: new Date() } })
  }
  const rows = await db.query.expenseCategoryBudgets.findMany({ where: eq(schema.expenseCategoryBudgets.householdId, householdId) })
  return Object.fromEntries(rows.map((row) => [row.category, Number(row.amount)]))
}

// --- Budget by period (docs/15_BUDGET_PERIODS.md) ---------------------------------------------------

const MAX_AMOUNT = 99_999_999.99

function validAmount(amount: number, message: string): string {
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) throw new Error(message)
  return (Math.round(amount * 100) / 100).toString()
}

async function ownStartDay(householdId: string): Promise<number> {
  const household = await getDb().query.households.findFirst({ where: eq(schema.households.id, householdId), columns: { budgetPeriodStartDay: true } })
  if (!household) throw new Error('Domácnost nebyla nalezena.')
  return household.budgetPeriodStartDay
}

/** The household's spending per day, all of it: one small aggregate the page turns into past periods,
 *  their totals and savings (lib/budget.ts spendingByPeriod), without loading every expense. */
export async function getBudgetHistoryAction(): Promise<{ date: string; total: number }[]> {
  const householdId = await requireHouseholdId()
  const rows = await getDb()
    .select({ date: schema.expenses.date, total: sql<string>`sum(${schema.expenses.amount})` })
    .from(schema.expenses)
    .where(eq(schema.expenses.householdId, householdId))
    .groupBy(schema.expenses.date)
    .orderBy(asc(schema.expenses.date))
  return rows.map((row) => ({ date: row.date, total: Number(row.total) }))
}

/** Every expense of one past (or the current) budget period, loaded when the household opens it. */
export async function getPeriodExpensesAction(period: string): Promise<Expense[]> {
  const householdId = await requireHouseholdId()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) throw new Error('Neplatné období.')
  // Normalised to the household's own period start, so any date inside a period loads that period.
  const from = periodStart(period, await ownStartDay(householdId))
  const rows = await getDb().query.expenses.findMany({
    where: and(eq(schema.expenses.householdId, householdId), gte(schema.expenses.date, from), lt(schema.expenses.date, nextPeriodStart(from))),
    orderBy: asc(schema.expenses.date),
  })
  return rows.map(toExpense)
}

/** Sets the budget of the current or the next period (`amount`), or returns it to the default from
 *  Profil (`null`). A finished period's budget stays as it was — its savings must not change after the
 *  fact. Returns every period budget of the household. */
export async function setPeriodBudgetAction(period: string, amount: number | null): Promise<Record<string, number>> {
  const householdId = await requireHouseholdId()
  const current = periodStart(todayInPrague(), await ownStartDay(householdId))
  if (period !== current && period !== nextPeriodStart(current)) throw new Error('Rozpočet lze nastavit jen pro aktuální a příští období.')
  const db = getDb()
  if (amount === null) {
    await db.delete(schema.budgets).where(and(eq(schema.budgets.householdId, householdId), eq(schema.budgets.month, period)))
  } else {
    const value = validAmount(amount, 'Rozpočet musí být částka 0 Kč nebo vyšší.')
    await db
      .insert(schema.budgets)
      .values({ householdId, month: period, amount: value })
      .onConflictDoUpdate({ target: [schema.budgets.householdId, schema.budgets.month], set: { amount: value } })
  }
  return getPeriodBudgets(householdId)
}

/** The household's monthly savings goal; 0 removes it. */
export async function setSavingsGoalAction(amount: number): Promise<number> {
  const householdId = await requireHouseholdId()
  const value = validAmount(amount, 'Cíl úspor musí být částka 0 Kč nebo vyšší.')
  await getDb().update(schema.households).set({ savingsGoal: value }).where(eq(schema.households.id, householdId))
  return Number(value)
}

async function getPeriodBudgets(householdId: string): Promise<Record<string, number>> {
  const rows = await getDb().query.budgets.findMany({ where: eq(schema.budgets.householdId, householdId), columns: { month: true, amount: true } })
  return Object.fromEntries(rows.map((row) => [row.month, Number(row.amount)]))
}
