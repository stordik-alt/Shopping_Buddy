import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm'
import type { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { money } from '@/lib/format'
import { createHouseholdNotification } from '@/lib/notify'
import { isRecurringIncomeDueDate, type RecurringIncomeInterval } from '@/lib/recurring-incomes'

type Db = ReturnType<typeof getDb>

/** Send one notification on the expected date for each unhandled recurring income.
 *  The reminder date is claimed before sending so overlapping cron runs do not duplicate it. */
export async function remindDueRecurringIncomes(db: Db, today: string): Promise<{ households: number; incomes: number }> {
  const rows = await db.query.recurringIncomes.findMany({ where: eq(schema.recurringIncomes.active, true) })
  const dueRows = rows.filter((row) => isRecurringIncomeDueDate({
    id: row.id,
    description: row.description,
    expectedAmount: Number(row.expectedAmount),
    intervalMonths: row.intervalMonths as RecurringIncomeInterval,
    startDate: row.startDate,
    active: row.active,
  }, today) && row.remindedDueDate !== today)
  if (dueRows.length === 0) return { households: 0, incomes: 0 }

  const ids = dueRows.map((row) => row.id)
  const occurrences = await db.query.recurringIncomeOccurrences.findMany({
    where: and(eq(schema.recurringIncomeOccurrences.dueDate, today), inArray(schema.recurringIncomeOccurrences.recurringIncomeId, ids)),
  })
  const handled = new Set(occurrences.map((row) => row.recurringIncomeId))
  const candidates = dueRows.filter((row) => !handled.has(row.id))
  if (candidates.length === 0) return { households: 0, incomes: 0 }

  const claimed: typeof candidates = []
  for (const row of candidates) {
    const result = await db.update(schema.recurringIncomes)
      .set({ remindedDueDate: today })
      .where(and(
        eq(schema.recurringIncomes.id, row.id),
        eq(schema.recurringIncomes.active, true),
        or(isNull(schema.recurringIncomes.remindedDueDate), ne(schema.recurringIncomes.remindedDueDate, today)),
      ))
      .returning({ id: schema.recurringIncomes.id })
    if (result.length > 0) claimed.push(row)
  }
  if (claimed.length === 0) return { households: 0, incomes: 0 }

  const byHousehold = new Map<string, typeof claimed>()
  for (const income of claimed) byHousehold.set(income.householdId, [...(byHousehold.get(income.householdId) ?? []), income])

  try {
    for (const [householdId, incomes] of byHousehold) {
      const list = incomes.map((income) => `${income.description} ${money(Number(income.expectedAmount))}`).join(', ')
      await createHouseholdNotification(
        db,
        householdId,
        {
          title: incomes.length === 1 ? 'Dnes očekáváte pravidelný příjem' : 'Dnes očekáváte pravidelné příjmy',
          detail: `${list}. Až peníze dorazí, potvrďte skutečně přijatou částku v Rozpočtu.`,
        },
        { kind: 'recurring_income', tab: 'Rozpočet' },
      )
    }
  } catch (error) {
    // Let the next cron run retry if storing the notification failed.
    for (const row of claimed) {
      await db.update(schema.recurringIncomes)
        .set({ remindedDueDate: row.remindedDueDate })
        .where(and(eq(schema.recurringIncomes.id, row.id), eq(schema.recurringIncomes.remindedDueDate, today)))
    }
    throw error
  }

  return { households: byHousehold.size, incomes: claimed.length }
}
