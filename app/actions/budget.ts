'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHousehold, requireHouseholdId } from '@/lib/auth/authorize'
import { monthSpending, notifyBudgetThresholds } from '@/lib/db/budget-notify'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { isExpenseCategory } from '@/lib/expense-categories'
import { validateExpenseInput, type ExpenseInput } from '@/lib/expense-input'
import { todayInPrague } from '@/lib/today'
import type { CategoryBudgets, Expense, Notification } from '@/lib/types'

type ExpenseRow = typeof schema.expenses.$inferSelect

function toExpense(row: ExpenseRow): Expense {
  return { id: row.id, amount: Number(row.amount), note: row.note, category: row.category, subcategory: row.subcategory, date: row.date, purchaseId: row.purchaseId }
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

export async function addExpenseAction(input: ExpenseInput): Promise<{ expense: Expense; notifications: Notification[] }> {
  const { householdId, userId } = await requireHousehold()
  const expense = validOrThrow(input)
  const db = getDb()
  // The budget and the category limits are monthly, so the 80 % / 100 % thresholds are checked
  // against the spending of the month the new expense falls in — not every expense ever recorded.
  const before = await monthSpending(db, householdId, expense.date)

  const [row] = await db
    .insert(schema.expenses)
    .values({ householdId, amount: expense.amount.toString(), note: expense.note, category: expense.category, subcategory: expense.subcategory, date: expense.date })
    .returning()

  const notifications = await notifyBudgetThresholds(db, householdId, before, [{ category: expense.category, amount: expense.amount }], userId)

  revalidatePath('/')
  return { expense: toExpense(row), notifications }
}

/** Corrects an expense: amount, category, subcategory, note or date. The budget notifications are
 *  not re-sent — they mark the moment spending crossed a threshold, which a correction does not. */
export async function updateExpenseAction(expenseId: string, input: ExpenseInput): Promise<{ expense: Expense }> {
  const householdId = await requireHouseholdId()
  await ownEditableExpense(householdId, expenseId)
  const expense = validOrThrow(input)
  const [row] = await getDb()
    .update(schema.expenses)
    .set({ amount: expense.amount.toString(), note: expense.note, category: expense.category, subcategory: expense.subcategory, date: expense.date })
    .where(and(eq(schema.expenses.id, expenseId), eq(schema.expenses.householdId, householdId)))
    .returning()
  revalidatePath('/')
  return { expense: toExpense(row) }
}

export async function deleteExpenseAction(expenseId: string): Promise<void> {
  const householdId = await requireHouseholdId()
  await ownEditableExpense(householdId, expenseId)
  await getDb().delete(schema.expenses).where(and(eq(schema.expenses.id, expenseId), eq(schema.expenses.householdId, householdId)))
  revalidatePath('/')
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
  revalidatePath('/')
  return Object.fromEntries(rows.map((row) => [row.category, Number(row.amount)]))
}
