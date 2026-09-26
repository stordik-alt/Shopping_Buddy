import { and, eq, inArray } from 'drizzle-orm'
import type { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { money } from '@/lib/format'
import { createHouseholdNotification } from '@/lib/notify'
import { paymentsToRemind, type RecurringInterval } from '@/lib/recurring-payments'

type Db = ReturnType<typeof getDb>

/** The morning reminder of recurring payments due today (run by the daily shopping-reminders cron):
 *  one notification per household listing them, each due date once (lib/recurring-payments.ts
 *  paymentsToRemind decides). The household confirms or skips them in Rozpočet. */
export async function remindDueRecurringPayments(db: Db, today: string): Promise<{ households: number; payments: number }> {
  const rows = await db.query.recurringPayments.findMany({ where: eq(schema.recurringPayments.active, true) })
  if (rows.length === 0) return { households: 0, payments: 0 }
  const occurrences = await db.query.recurringPaymentOccurrences.findMany({
    where: and(eq(schema.recurringPaymentOccurrences.dueDate, today), inArray(schema.recurringPaymentOccurrences.recurringPaymentId, rows.map((row) => row.id))),
  })
  const due = paymentsToRemind(
    rows.map((row) => ({ ...row, amount: Number(row.amount), intervalMonths: row.intervalMonths as RecurringInterval })),
    occurrences.map((entry) => ({ recurringPaymentId: entry.recurringPaymentId, dueDate: entry.dueDate, status: entry.status === 'skipped' ? 'skipped' : 'paid' })),
    today,
  )
  const byHousehold = new Map<string, typeof due>()
  for (const payment of due) byHousehold.set(payment.householdId, [...(byHousehold.get(payment.householdId) ?? []), payment])

  for (const [householdId, payments] of byHousehold) {
    const list = payments.map((payment) => `${payment.name} ${money(payment.amount)}`).join(', ')
    await createHouseholdNotification(
      db,
      householdId,
      { title: payments.length === 1 ? 'Dnes je splatná platba' : 'Dnes jsou splatné platby', detail: `${list}. Potvrďte je v Rozpočtu, až budou zaplacené.` },
      { tab: 'Rozpočet' },
    )
    await db
      .update(schema.recurringPayments)
      .set({ remindedDueDate: today })
      .where(inArray(schema.recurringPayments.id, payments.map((payment) => payment.id)))
  }
  return { households: byHousehold.size, payments: due.length }
}
