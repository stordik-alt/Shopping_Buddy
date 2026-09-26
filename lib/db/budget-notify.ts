import { and, eq, gte, lt } from 'drizzle-orm'
import { crossedBudgetThreshold } from '@/lib/budget'
import type { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { ExpenseCategory } from '@/lib/expense-categories'
import { money } from '@/lib/format'
import { createHouseholdNotification } from '@/lib/notify'
import type { Notification } from '@/lib/types'

// The budget's 80 % / 100 % notifications, for the overall monthly budget and for each category's
// own limit (expense_category_budgets). Shared by an expense typed in (app/actions/budget.ts) and a
// receipt's purchase (app/actions/receipts.ts): read the month's spending before writing, then pass
// what was added. Each threshold fires once, at the crossing (lib/budget.ts crossedBudgetThreshold).

type Db = ReturnType<typeof getDb>

export type MonthSpending = { total: number; byCategory: Map<ExpenseCategory, number> }

/** First day of the month an ISO date falls in, and of the next one. */
function monthBounds(date: string): { from: string; until: string } {
  const [year, month] = date.split('-').map(Number)
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  return { from: `${date.slice(0, 7)}-01`, until: next }
}

/** What the household had spent in the month of `date`, overall and per category. */
export async function monthSpending(db: Db, householdId: string, date: string): Promise<MonthSpending> {
  const { from, until } = monthBounds(date)
  const rows = await db.query.expenses.findMany({
    where: and(eq(schema.expenses.householdId, householdId), gte(schema.expenses.date, from), lt(schema.expenses.date, until)),
    columns: { amount: true, category: true },
  })
  const byCategory = new Map<ExpenseCategory, number>()
  let total = 0
  for (const row of rows) {
    const amount = Number(row.amount)
    total += amount
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + amount)
  }
  return { total, byCategory }
}

/** Notifies the household of every threshold the `added` expenses cross — the overall monthly budget
 *  and each category's limit. `before` is monthSpending() read before they were written;
 *  `excludeUserId` is who caused it (they see it in the app, the others on their phones). Returns the
 *  notifications created, overall first. */
export async function notifyBudgetThresholds(
  db: Db,
  householdId: string,
  before: MonthSpending,
  added: { category: ExpenseCategory; amount: number }[],
  excludeUserId?: string,
): Promise<Notification[]> {
  const [household, limits] = await Promise.all([
    db.query.households.findFirst({ where: eq(schema.households.id, householdId), columns: { monthlyBudget: true } }),
    db.query.expenseCategoryBudgets.findMany({ where: eq(schema.expenseCategoryBudgets.householdId, householdId) }),
  ])
  const notify = async (title: string, detail: string): Promise<Notification> => {
    const row = await createHouseholdNotification(db, householdId, { title, detail }, { tab: 'Rozpočet', ...(excludeUserId ? { excludeUserId } : {}) })
    return { id: row.id, title: row.title, detail: row.detail, unread: row.unread }
  }
  const created: Notification[] = []

  const budget = Number(household?.monthlyBudget ?? 0)
  const totalAdded = added.reduce((sum, entry) => sum + entry.amount, 0)
  const overall = crossedBudgetThreshold(before.total, before.total + totalAdded, budget)
  if (overall) {
    const after = before.total + totalAdded
    created.push(
      await notify(
        overall === 'exceeded' ? 'Rozpočet byl překročen' : 'Blížíte se limitu rozpočtu',
        overall === 'exceeded'
          ? `Měsíční výdaje (${money(after)}) právě překročily rozpočet ${money(budget)}.`
          : `Měsíční výdaje dosáhly 80 % rozpočtu — ${money(after)} z ${money(budget)}.`,
      ),
    )
  }

  const addedByCategory = new Map<ExpenseCategory, number>()
  for (const entry of added) addedByCategory.set(entry.category, (addedByCategory.get(entry.category) ?? 0) + entry.amount)
  for (const limit of limits) {
    const amount = addedByCategory.get(limit.category)
    if (!amount) continue
    const spentBefore = before.byCategory.get(limit.category) ?? 0
    const after = spentBefore + amount
    const crossed = crossedBudgetThreshold(spentBefore, after, Number(limit.amount))
    if (!crossed) continue
    created.push(
      await notify(
        crossed === 'exceeded' ? `${limit.category}: limit překročen` : `${limit.category}: 80 % limitu`,
        crossed === 'exceeded'
          ? `Výdaje za ${limit.category.toLocaleLowerCase('cs')} (${money(after)}) právě překročily měsíční limit ${money(Number(limit.amount))}.`
          : `Výdaje za ${limit.category.toLocaleLowerCase('cs')} dosáhly 80 % měsíčního limitu — ${money(after)} z ${money(Number(limit.amount))}.`,
      ),
    )
  }
  return created
}
