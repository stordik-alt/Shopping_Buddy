import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { notifyBudgetThresholds, periodSpending } from '@/lib/db/budget-notify'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { isDueDate, validateRecurringPaymentInput, type RecurringInterval, type RecurringOccurrence, type RecurringPayment } from '@/lib/recurring-payments'
import { validateExpenseInput } from '@/lib/expense-input'
import { todayInPrague } from '@/lib/today'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const toPayment = (row: typeof schema.recurringPayments.$inferSelect): RecurringPayment => ({
  id: row.id, name: row.name, category: row.category, subcategory: row.subcategory, amount: Number(row.amount),
  intervalMonths: row.intervalMonths as RecurringInterval, startDate: row.startDate, active: row.active,
})

export async function PATCH(request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const { paymentId } = await params
    const db = getDb()
    const existing = await db.query.recurringPayments.findFirst({ where: and(eq(schema.recurringPayments.id, paymentId), eq(schema.recurringPayments.householdId, member.householdId)) })
    if (!existing) return json({ error: 'payment_not_found' }, 404)
    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof (body as Record<string, unknown>).action !== 'string') return json({ error: 'invalid_request' }, 400)
    const input = body as Record<string, unknown>

    if (input.action === 'save') {
      if (Object.keys(input).some((key) => !['action', 'name', 'category', 'subcategory', 'amount', 'intervalMonths', 'startDate'].includes(key)) || typeof input.name !== 'string' || typeof input.category !== 'string' || (input.subcategory !== null && typeof input.subcategory !== 'string') || typeof input.amount !== 'number' || typeof input.intervalMonths !== 'number' || typeof input.startDate !== 'string') return json({ error: 'invalid_payment' }, 400)
      const validated = validateRecurringPaymentInput({ name: input.name, category: input.category, subcategory: input.subcategory as string | null, amount: input.amount, intervalMonths: input.intervalMonths, startDate: input.startDate }, todayInPrague())
      if ('error' in validated) return json({ error: 'invalid_payment', message: validated.error }, 400)
      const payment = validated.payment
      const [row] = await db.update(schema.recurringPayments).set({ ...payment, amount: payment.amount.toString() })
        .where(and(eq(schema.recurringPayments.id, paymentId), eq(schema.recurringPayments.householdId, member.householdId))).returning()
      return json({ payment: toPayment(row) })
    }

    if (input.action === 'stop') {
      if (Object.keys(input).length !== 1) return json({ error: 'invalid_request' }, 400)
      await db.update(schema.recurringPayments).set({ active: false }).where(and(eq(schema.recurringPayments.id, paymentId), eq(schema.recurringPayments.householdId, member.householdId)))
      return json({ ok: true })
    }

    if ((input.action === 'confirm' || input.action === 'skip') && typeof input.dueDate === 'string') {
      const allowedKeys = input.action === 'confirm' ? ['action', 'dueDate', 'amount', 'date'] : ['action', 'dueDate']
      if (Object.keys(input).some((key) => !allowedKeys.includes(key)) || !existing.active || !isDueDate(toPayment(existing), input.dueDate) || input.dueDate > todayInPrague()) return json({ error: 'invalid_occurrence', message: 'Tato platba není splatná nebo už je vyřízená.' }, 400)
      const handled = await db.query.recurringPaymentOccurrences.findFirst({ where: and(eq(schema.recurringPaymentOccurrences.recurringPaymentId, paymentId), eq(schema.recurringPaymentOccurrences.dueDate, input.dueDate)) })
      if (handled) return json({ error: 'already_handled', message: handled.status === 'paid' ? 'Tato platba už je zaplacená.' : 'Tato platba už je přeskočená.' }, 409)
      if (input.action === 'skip') {
        const [occurrence] = await db.insert(schema.recurringPaymentOccurrences).values({ recurringPaymentId: paymentId, dueDate: input.dueDate, status: 'skipped' }).onConflictDoNothing().returning()
        if (!occurrence) return json({ error: 'already_handled', message: 'Tuto platbu už mezitím vyřídil někdo jiný.' }, 409)
        return json({ occurrence: { recurringPaymentId: paymentId, dueDate: input.dueDate, status: 'skipped' } satisfies RecurringOccurrence })
      }
      if (typeof input.amount !== 'number' || typeof input.date !== 'string') return json({ error: 'invalid_payment', message: 'Vyplňte skutečnou částku a datum platby.' }, 400)
      const valid = validateExpenseInput({ amount: input.amount, note: existing.name, category: existing.category, subcategory: existing.subcategory, date: input.date }, todayInPrague())
      if ('error' in valid) return json({ error: 'invalid_payment', message: valid.error }, 400)
      const before = await periodSpending(db, member.householdId, valid.expense.date)
      const expenseId = crypto.randomUUID()
      try {
        await db.batch([
          db.insert(schema.expenses).values({ id: expenseId, householdId: member.householdId, amount: valid.expense.amount.toString(), note: valid.expense.note, category: valid.expense.category, subcategory: valid.expense.subcategory, date: valid.expense.date }),
          db.insert(schema.recurringPaymentOccurrences).values({ recurringPaymentId: paymentId, dueDate: input.dueDate, status: 'paid', expenseId }),
        ])
      } catch (error) {
        if (String(error).includes('recurring_payment_occurrences_recurring_payment_id_due_date_pk')) return json({ error: 'already_handled', message: 'Tuto platbu už mezitím vyřídil někdo jiný.' }, 409)
        throw error
      }
      const notifications = await notifyBudgetThresholds(db, member.householdId, before, [{ category: valid.expense.category, amount: valid.expense.amount }], user.id)
      return json({ expense: { id: expenseId, ...valid.expense, purchaseId: null }, occurrence: { recurringPaymentId: paymentId, dueDate: input.dueDate, status: 'paid' } satisfies RecurringOccurrence, notifications })
    }
    return json({ error: 'invalid_action' }, 400)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile recurring payment update]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const { paymentId } = await params
    const [row] = await getDb().update(schema.recurringPayments).set({ active: false })
      .where(and(eq(schema.recurringPayments.id, paymentId), eq(schema.recurringPayments.householdId, member.householdId))).returning({ id: schema.recurringPayments.id })
    if (!row) return json({ error: 'payment_not_found' }, 404)
    return json({ ok: true })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile recurring payment stop]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
