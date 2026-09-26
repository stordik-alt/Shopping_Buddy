import { and, eq, gte, lt } from 'drizzle-orm'
import { crossedBudgetThreshold } from '@/lib/budget'
import type { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { money } from '@/lib/format'
import { createHouseholdNotification } from '@/lib/notify'
import type { Notification } from '@/lib/types'

type Db = ReturnType<typeof getDb>

/** First day of the month an ISO date falls in, and of the next one. */
function monthBounds(date: string): { from: string; until: string } {
  const [year, month] = date.split('-').map(Number)
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  return { from: `${date.slice(0, 7)}-01`, until: next }
}

/** What the household had spent in the month of `date`, before the expenses about to be added. */
export async function spentInMonth(db: Db, householdId: string, date: string): Promise<number> {
  const { from, until } = monthBounds(date)
  const rows = await db.query.expenses.findMany({
    where: and(eq(schema.expenses.householdId, householdId), gte(schema.expenses.date, from), lt(schema.expenses.date, until)),
    columns: { amount: true },
  })
  return rows.reduce((sum, row) => sum + Number(row.amount), 0)
}

/** Notifies the household when `added` takes the month's spending across 80 % or 100 % of its
 *  monthly budget — once, at the crossing (lib/budget.ts crossedBudgetThreshold). Shared by an
 *  expense typed in and a receipt's purchase. `excludeUserId` is who caused it: they see it in the
 *  app, the others on their phones. */
export async function notifyBudgetThreshold(
  db: Db,
  householdId: string,
  spentBefore: number,
  added: number,
  excludeUserId?: string,
): Promise<Notification | null> {
  const household = await db.query.households.findFirst({ where: eq(schema.households.id, householdId), columns: { monthlyBudget: true } })
  const budget = Number(household?.monthlyBudget ?? 0)
  const spentAfter = spentBefore + added
  const threshold = crossedBudgetThreshold(spentBefore, spentAfter, budget)
  if (!threshold) return null
  const row = await createHouseholdNotification(
    db,
    householdId,
    {
      title: threshold === 'exceeded' ? 'Rozpočet byl překročen' : 'Blížíte se limitu rozpočtu',
      detail:
        threshold === 'exceeded'
          ? `Měsíční výdaje (${money(spentAfter)}) právě překročily rozpočet ${money(budget)}.`
          : `Měsíční výdaje dosáhly 80 % rozpočtu — ${money(spentAfter)} z ${money(budget)}.`,
    },
    { tab: 'Rozpočet', ...(excludeUserId ? { excludeUserId } : {}) },
  )
  return { id: row.id, title: row.title, detail: row.detail, unread: row.unread }
}
