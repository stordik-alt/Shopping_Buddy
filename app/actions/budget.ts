'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHousehold } from '@/lib/auth/authorize'
import { crossedBudgetThreshold, expensesInMonth, totalSpent } from '@/lib/budget'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { money } from '@/lib/format'
import { createHouseholdNotification } from '@/lib/notify'
import type { Expense, ItemCategory, Notification } from '@/lib/types'

export async function addExpenseAction(
  expense: { amount: number; note: string; category: ItemCategory; date: string },
): Promise<{ expense: Expense; notification: Notification | null }> {
  const { householdId, userId } = await requireHousehold()
  const db = getDb()

  const [household, existingExpenses] = await Promise.all([
    db.query.households.findFirst({ where: eq(schema.households.id, householdId) }),
    db.query.expenses.findMany({ where: eq(schema.expenses.householdId, householdId) }),
  ])
  // The budget is monthly, so the 80 % / 100 % thresholds are checked against the spending of the
  // month the new expense falls in — not every expense ever recorded.
  const spentBefore = totalSpent(expensesInMonth(existingExpenses.map((e) => ({ ...e, amount: Number(e.amount) })), expense.date))

  const [row] = await db
    .insert(schema.expenses)
    .values({ householdId, amount: expense.amount.toString(), note: expense.note, category: expense.category, date: expense.date })
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
  return {
    expense: { id: row.id, amount: Number(row.amount), note: row.note, category: row.category, date: row.date },
    notification,
  }
}
