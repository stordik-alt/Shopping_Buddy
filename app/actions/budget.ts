'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { crossedBudgetThreshold, totalSpent } from '@/lib/budget'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { money } from '@/lib/format'
import type { Expense, ItemCategory, Notification } from '@/lib/types'

export async function addExpenseAction(
  expense: { amount: number; note: string; category: ItemCategory; date: string },
): Promise<{ expense: Expense; notification: Notification | null }> {
  const householdId = await requireHouseholdId()
  const db = getDb()

  const [household, existingExpenses] = await Promise.all([
    db.query.households.findFirst({ where: eq(schema.households.id, householdId) }),
    db.query.expenses.findMany({ where: eq(schema.expenses.householdId, householdId) }),
  ])
  const spentBefore = totalSpent(existingExpenses.map((e) => ({ ...e, amount: Number(e.amount) })))

  const [row] = await db
    .insert(schema.expenses)
    .values({ householdId, amount: expense.amount.toString(), note: expense.note, category: expense.category, date: expense.date })
    .returning()

  let notification: Notification | null = null
  const budget = Number(household?.monthlyBudget ?? 0)
  const threshold = crossedBudgetThreshold(spentBefore, spentBefore + expense.amount, budget)
  if (threshold) {
    const spentAfter = spentBefore + expense.amount
    const [notificationRow] = await db
      .insert(schema.notifications)
      .values({
        householdId,
        title: threshold === 'exceeded' ? 'Rozpočet byl překročen' : 'Blížíte se limitu rozpočtu',
        detail:
          threshold === 'exceeded'
            ? `Měsíční výdaje (${money(spentAfter)}) právě překročily rozpočet ${money(budget)}.`
            : `Měsíční výdaje dosáhly 80 % rozpočtu — ${money(spentAfter)} z ${money(budget)}.`,
      })
      .returning()
    notification = { id: notificationRow.id, title: notificationRow.title, detail: notificationRow.detail, unread: notificationRow.unread }
  }

  revalidatePath('/')
  return {
    expense: { id: row.id, amount: Number(row.amount), note: row.note, category: row.category, date: row.date },
    notification,
  }
}
