import { and, asc, eq, gte, lte, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { recurringOverview, validateRecurringPaymentInput, type RecurringInterval, type RecurringOccurrence, type RecurringPayment } from '@/lib/recurring-payments'
import { todayInPrague } from '@/lib/today'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }
const toPayment = (row: typeof schema.recurringPayments.$inferSelect): RecurringPayment => ({
  id: row.id, name: row.name, category: row.category, subcategory: row.subcategory, amount: Number(row.amount),
  intervalMonths: row.intervalMonths as RecurringInterval, startDate: row.startDate, active: row.active,
})

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const today = todayInPrague()
    const db = getDb()
    const rows = await db.query.recurringPayments.findMany({
      where: eq(schema.recurringPayments.householdId, member.householdId),
      orderBy: asc(schema.recurringPayments.name),
    })
    const ids = rows.map((row) => row.id)
    const occurrences = ids.length ? await db.query.recurringPaymentOccurrences.findMany({
      where: and(inArray(schema.recurringPaymentOccurrences.recurringPaymentId, ids), gte(schema.recurringPaymentOccurrences.dueDate, addDays(today, -365)), lte(schema.recurringPaymentOccurrences.dueDate, addDays(today, 31))),
      columns: { recurringPaymentId: true, dueDate: true, status: true },
    }) : []
    const payments = rows.map(toPayment)
    const mappedOccurrences: RecurringOccurrence[] = occurrences.map((row) => ({ recurringPaymentId: row.recurringPaymentId, dueDate: row.dueDate, status: row.status === 'skipped' ? 'skipped' : 'paid' }))
    return json({ today, payments, occurrences: mappedOccurrences, ...recurringOverview(payments, mappedOccurrences, today) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile recurring payments]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_request' }, 400)
    const input = body as Record<string, unknown>
    if (Object.keys(input).some((key) => !['name', 'category', 'subcategory', 'amount', 'intervalMonths', 'startDate'].includes(key)) || typeof input.name !== 'string' || typeof input.category !== 'string' || (input.subcategory !== null && typeof input.subcategory !== 'string') || typeof input.amount !== 'number' || typeof input.intervalMonths !== 'number' || typeof input.startDate !== 'string') {
      return json({ error: 'invalid_payment', message: 'Vyplňte název, kategorii, částku, četnost a datum první platby.' }, 400)
    }
    const validated = validateRecurringPaymentInput({ name: input.name, category: input.category, subcategory: input.subcategory as string | null, amount: input.amount, intervalMonths: input.intervalMonths, startDate: input.startDate }, todayInPrague())
    if ('error' in validated) return json({ error: 'invalid_payment', message: validated.error }, 400)
    const payment = validated.payment
    const [row] = await getDb().insert(schema.recurringPayments).values({ householdId: member.householdId, ...payment, amount: payment.amount.toString() }).returning()
    return json({ payment: toPayment(row) }, 201)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile recurring payment add]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
