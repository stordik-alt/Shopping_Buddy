import { and, asc, eq, gte, lt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { nextPeriodStartFor, periodEndFor, periodStartFor } from '@/lib/budget-period'
import { notifyBudgetThresholds, periodSpending } from '@/lib/db/budget-notify'
import { recordAudit } from '@/lib/db/audit'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { loadPeriodConfig } from '@/lib/db/period-config'
import { validateExpenseInput } from '@/lib/expense-input'
import { todayInPrague } from '@/lib/today'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

type ExpenseRow = typeof schema.expenses.$inferSelect
function toMobileExpense(row: ExpenseRow) {
  return {
    id: row.id,
    amount: Number(row.amount),
    note: row.note,
    category: row.category,
    subcategory: row.subcategory,
    date: row.date,
    editable: row.purchaseId === null,
  }
}

async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

function expenseInput(body: Record<string, unknown>) {
  if (
    typeof body.amount !== 'number' || typeof body.note !== 'string' || typeof body.category !== 'string' ||
    (body.subcategory !== null && typeof body.subcategory !== 'string') || typeof body.date !== 'string' ||
    Object.keys(body).some((key) => !['amount', 'note', 'category', 'subcategory', 'date'].includes(key))
  ) return null
  return { amount: body.amount, note: body.note, category: body.category, subcategory: body.subcategory as string | null, date: body.date }
}

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)

    const db = getDb()
    const config = await loadPeriodConfig(db, member.householdId)
    const requestedPeriod = new URL(request.url).searchParams.get('period') ?? todayInPrague()
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedPeriod) ? new Date(`${requestedPeriod}T00:00:00.000Z`) : null
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== requestedPeriod) return json({ error: 'invalid_period' }, 400)
    const start = periodStartFor(config, requestedPeriod)
    const end = nextPeriodStartFor(config, start)
    const rows = await db.query.expenses.findMany({
      where: and(eq(schema.expenses.householdId, member.householdId), gte(schema.expenses.date, start), lt(schema.expenses.date, end)),
      orderBy: [asc(schema.expenses.date), asc(schema.expenses.createdAt)],
    })
    return json({ period: { start, end: periodEndFor(config, start), next: end }, expenses: rows.map(toMobileExpense) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile expenses]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const body = await bodyObject(request)
    const input = body && expenseInput(body)
    if (!input) return json({ error: 'invalid_expense', message: 'Vyplňte částku, kategorii a datum výdaje.' }, 400)
    const validated = validateExpenseInput(input, todayInPrague())
    if ('error' in validated) return json({ error: 'invalid_expense', message: validated.error }, 400)

    const db = getDb()
    const before = await periodSpending(db, member.householdId, validated.expense.date)
    const [row] = await db.insert(schema.expenses).values({
      householdId: member.householdId,
      amount: validated.expense.amount.toString(),
      note: validated.expense.note,
      category: validated.expense.category,
      subcategory: validated.expense.subcategory,
      date: validated.expense.date,
    }).returning()
    const notifications = await notifyBudgetThresholds(db, member.householdId, before, [{ category: validated.expense.category, amount: validated.expense.amount }], user.id)
    await recordAudit({ householdId: member.householdId, memberId: member.id }, 'expense.added', {
      amount: validated.expense.amount, category: validated.expense.category, date: validated.expense.date,
    }, row.id)
    return json({ expense: toMobileExpense(row), notifications }, 201)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile expenses add]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
