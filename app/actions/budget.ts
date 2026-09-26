'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHousehold, requireHouseholdId } from '@/lib/auth/authorize'
import { notifyBudgetThreshold, spentInMonth } from '@/lib/db/budget-notify'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { validateExpenseInput, type ExpenseInput } from '@/lib/expense-input'
import { todayInPrague } from '@/lib/today'
import type { Expense, Notification } from '@/lib/types'

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

export async function addExpenseAction(input: ExpenseInput): Promise<{ expense: Expense; notification: Notification | null }> {
  const { householdId, userId } = await requireHousehold()
  const expense = validOrThrow(input)
  const db = getDb()
  // The budget is monthly, so the 80 % / 100 % thresholds are checked against the spending of the
  // month the new expense falls in — not every expense ever recorded.
  const spentBefore = await spentInMonth(db, householdId, expense.date)

  const [row] = await db
    .insert(schema.expenses)
    .values({ householdId, amount: expense.amount.toString(), note: expense.note, category: expense.category, subcategory: expense.subcategory, date: expense.date })
    .returning()

  const notification = await notifyBudgetThreshold(db, householdId, spentBefore, expense.amount, userId)

  revalidatePath('/')
  return { expense: toExpense(row), notification }
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
