import { and, eq, gte, lt } from 'drizzle-orm'
import { crossedBudgetThreshold, nextPeriodStart, periodStart } from '@/lib/budget'
import type { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { ExpenseCategory } from '@/lib/expense-categories'
import { money } from '@/lib/format'
import { createHouseholdNotification } from '@/lib/notify'
import type { Notification } from '@/lib/types'

// The budget's 80 % / 100 % notifications, for the overall budget of the household's period and for each category's
// own limit (expense_category_budgets). Shared by an expense typed in (app/actions/budget.ts) and a
// receipt's purchase (app/actions/receipts.ts): read the period's spending before writing, then pass
// what was added. Each threshold fires once, at the crossing (lib/budget.ts crossedBudgetThreshold).

type Db = ReturnType<typeof getDb>

/** `period` is the budget period's start date: its own budget (docs/15_BUDGET_PERIODS.md) is what the
 *  overall thresholds are checked against. */
export type PeriodSpending = { period: string; total: number; byCategory: Map<ExpenseCategory, number> }

/** What the household had spent in the budget period `date` falls in (it starts on the household's
 *  chosen day of the month, lib/budget.ts), overall and per category. */
export async function periodSpending(db: Db, householdId: string, date: string): Promise<PeriodSpending> {
  const household = await db.query.households.findFirst({ where: eq(schema.households.id, householdId), columns: { budgetPeriodStartDay: true } })
  const from = periodStart(date, household?.budgetPeriodStartDay ?? 1)
  const until = nextPeriodStart(from)
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
  return { period: from, total, byCategory }
}

/** Notifies the household of every threshold the `added` expenses cross — the overall monthly budget
 *  and each category's limit. `before` is periodSpending() read before they were written;
 *  `excludeUserId` is who caused it (they see it in the app, the others on their phones). Returns the
 *  notifications created, overall first. */
export async function notifyBudgetThresholds(
  db: Db,
  householdId: string,
  before: PeriodSpending,
  added: { category: ExpenseCategory; amount: number }[],
  excludeUserId?: string,
): Promise<Notification[]> {
  const [household, periodBudget, limits] = await Promise.all([
    db.query.households.findFirst({ where: eq(schema.households.id, householdId), columns: { monthlyBudget: true } }),
    db.query.budgets.findFirst({ where: and(eq(schema.budgets.householdId, householdId), eq(schema.budgets.month, before.period)), columns: { amount: true } }),
    db.query.expenseCategoryBudgets.findMany({ where: eq(schema.expenseCategoryBudgets.householdId, householdId) }),
  ])
  const notify = async (kind: 'budget' | 'category_limit', title: string, detail: string): Promise<Notification> => {
    const row = await createHouseholdNotification(db, householdId, { title, detail }, { kind, tab: 'Rozpočet', ...(excludeUserId ? { excludeUserId } : {}) })
    return { id: row.id, title: row.title, detail: row.detail, unread: row.unread, kind: row.kind }
  }
  const created: Notification[] = []

  // The period's own budget when the household set one, else the default (lib/budget.ts budgetForPeriod).
  const budget = Number(periodBudget?.amount ?? household?.monthlyBudget ?? 0)
  const totalAdded = added.reduce((sum, entry) => sum + entry.amount, 0)
  const overall = crossedBudgetThreshold(before.total, before.total + totalAdded, budget)
  if (overall) {
    const after = before.total + totalAdded
    created.push(
      await notify(
        'budget',
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
        'category_limit',
        crossed === 'exceeded' ? `${limit.category}: limit překročen` : `${limit.category}: 80 % limitu`,
        crossed === 'exceeded'
          ? `Výdaje za ${limit.category.toLocaleLowerCase('cs')} (${money(after)}) právě překročily měsíční limit ${money(Number(limit.amount))}.`
          : `Výdaje za ${limit.category.toLocaleLowerCase('cs')} dosáhly 80 % měsíčního limitu — ${money(after)} z ${money(Number(limit.amount))}.`,
      ),
    )
  }
  return created
}
