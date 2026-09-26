'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHousehold, requireHouseholdId } from '@/lib/auth/authorize'
import { crossedBudgetThreshold, expensesInMonth, totalSpent } from '@/lib/budget'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { validateExpenseInput, type ExpenseInput } from '@/lib/expense-input'
import { money } from '@/lib/format'
import { createHouseholdNotification } from '@/lib/notify'
import { todayInPrague } from '@/lib/today'
import type { Expense, Notification } from '@/lib/types'

type ExpenseRow = typeof schema.expenses.$inferSelect

function toExpense(row: ExpenseRow): Expense {
  return { id: row.id, amount: Number(row.amount), note: row.note, category: row.category, subcategory: row.subcategory, date: row.date }
}

/** The input checked by lib/expense-input.ts; its message is shown to the user as it is. */
function validOrThrow(input: ExpenseInput) {
  const result = validateExpenseInput(input, todayInPrague())
  if ('error' in result) throw new Error(result.error)
  return result.expense
}

/** Loads one expense of the caller's household; any other id is "not found" (CLAUDE.md section 9:
 *  a client-supplied id never reaches another household's data). */
async function ownExpense(householdId: string, expenseId: string): Promise<ExpenseRow> {
  const row = await getDb().query.expenses.findFirst({ where: and(eq(schema.expenses.id, expenseId), eq(schema.expenses.householdId, householdId)) })
  if (!row) throw new Error('Výdaj nebyl nalezen.')
  return row
}

export async function addExpenseAction(input: ExpenseInput): Promise<{ expense: Expense; notification: Notification | null }> {
  const { householdId, userId } = await requireHousehold()
  const expense = validOrThrow(input)
  const db = getDb()

  const [household, existingExpenses] = await Promise.all([
    db.query.households.findFirst({ where: eq(schema.households.id, householdId) }),
    db.query.expenses.findMany({ where: eq(schema.expenses.householdId, householdId) }),
  ])
  // The budget is monthly, so the 80 % / 100 % thresholds are checked against the spending of the
  // month the new expense falls in — not every expense ever recorded.
  const spentBefore = totalSpent(expensesInMonth(existingExpenses.map(toExpense), expense.date))

  const [row] = await db
    .insert(schema.expenses)
    .values({ householdId, amount: expense.amount.toString(), note: expense.note, category: expense.category, subcategory: expense.subcategory, date: expense.date })
    .returning()

  let notification: Notification | null = null
  const budget = Number(household?.monthlyBudget ?? 0)
  const threshold = crossedBudgetThreshold(spentBefore, spentBefore + expense.amount, budget)
  if (threshold) {
    const spentAfter = spentBefore + expense.amount
    // The other members hear about it on their phones; whoever added the expense sees it in the app.
    const notificationRow = await createHouseholdNotification(
      db,
      householdId,
      {
        title: threshold === 'exceeded' ? 'Rozpočet byl překročen' : 'Blížíte se limitu rozpočtu',
        detail:
          threshold === 'exceeded'
            ? `Měsíční výdaje (${money(spentAfter)}) právě překročily rozpočet ${money(budget)}.`
            : `Měsíční výdaje dosáhly 80 % rozpočtu — ${money(spentAfter)} z ${money(budget)}.`,
      },
      { tab: 'Rozpočet', excludeUserId: userId },
    )
    notification = { id: notificationRow.id, title: notificationRow.title, detail: notificationRow.detail, unread: notificationRow.unread }
  }

  revalidatePath('/')
  return { expense: toExpense(row), notification }
}

/** Corrects an expense: amount, category, subcategory, note or date. The budget notifications are
 *  not re-sent — they mark the moment spending crossed a threshold, which a correction does not. */
export async function updateExpenseAction(expenseId: string, input: ExpenseInput): Promise<{ expense: Expense }> {
  const householdId = await requireHouseholdId()
  await ownExpense(householdId, expenseId)
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
  await ownExpense(householdId, expenseId)
  await getDb().delete(schema.expenses).where(and(eq(schema.expenses.id, expenseId), eq(schema.expenses.householdId, householdId)))
  revalidatePath('/')
}
