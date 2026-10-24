import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { recurringIncomeOverview, validateRecurringIncomeInput, type RecurringIncome, type RecurringIncomeOccurrence } from '@/lib/recurring-incomes'
import { todayInPrague } from '@/lib/today'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }
const toIncome = (row: typeof schema.recurringIncomes.$inferSelect): RecurringIncome => ({
  id: row.id, description: row.description, expectedAmount: Number(row.expectedAmount),
  intervalMonths: row.intervalMonths as RecurringIncome['intervalMonths'], startDate: row.startDate, active: row.active,
})

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const today = todayInPrague()
    const db = getDb()
    const rows = await db.query.recurringIncomes.findMany({
      where: eq(schema.recurringIncomes.householdId, member.householdId),
      orderBy: [asc(schema.recurringIncomes.startDate), asc(schema.recurringIncomes.description)],
    })
    const ids = rows.map((row) => row.id)
    const occurrences = ids.length ? await db.query.recurringIncomeOccurrences.findMany({
      where: and(inArray(schema.recurringIncomeOccurrences.recurringIncomeId, ids), gte(schema.recurringIncomeOccurrences.dueDate, addDays(today, -365)), lte(schema.recurringIncomeOccurrences.dueDate, addDays(today, 31))),
      columns: { recurringIncomeId: true, dueDate: true, status: true },
    }) : []
    const payments = rows.map(toIncome)
    const mappedOccurrences: RecurringIncomeOccurrence[] = occurrences.map((row) => ({ recurringIncomeId: row.recurringIncomeId, dueDate: row.dueDate, status: row.status === 'skipped' ? 'skipped' : 'received' }))
    return json({ today, payments, occurrences: mappedOccurrences, ...recurringIncomeOverview(payments, mappedOccurrences, today) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile recurring incomes]', error)
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
    if (Object.keys(input).some((key) => !['description', 'expectedAmount', 'intervalMonths', 'startDate'].includes(key)) || typeof input.description !== 'string' || typeof input.expectedAmount !== 'number' || typeof input.intervalMonths !== 'number' || typeof input.startDate !== 'string') return json({ error: 'invalid_income', message: 'Vyplňte popis, částku, četnost a první datum příjmu.' }, 400)
    const checked = validateRecurringIncomeInput({ description: input.description, expectedAmount: input.expectedAmount, intervalMonths: input.intervalMonths, startDate: input.startDate }, todayInPrague())
    if ('error' in checked) return json({ error: 'invalid_income', message: checked.error }, 400)
    const [row] = await getDb().insert(schema.recurringIncomes).values({ householdId: member.householdId, ...checked.income, expectedAmount: checked.income.expectedAmount.toString() }).returning()
    return json({ payment: toIncome(row) }, 201)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile recurring income add]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
