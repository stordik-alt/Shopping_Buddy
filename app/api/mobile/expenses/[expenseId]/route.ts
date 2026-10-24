import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { recordAudit } from '@/lib/db/audit'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { validateExpenseInput } from '@/lib/expense-input'
import { todayInPrague } from '@/lib/today'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Context = { params: Promise<{ expenseId: string }> }
type ExpenseRow = typeof schema.expenses.$inferSelect

function toMobileExpense(row: ExpenseRow) {
  return { id: row.id, amount: Number(row.amount), note: row.note, category: row.category, subcategory: row.subcategory, date: row.date, editable: row.purchaseId === null }
}

async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

function parseInput(body: Record<string, unknown>) {
  if (
    typeof body.amount !== 'number' || typeof body.note !== 'string' || typeof body.category !== 'string' ||
    (body.subcategory !== null && typeof body.subcategory !== 'string') || typeof body.date !== 'string' ||
    Object.keys(body).some((key) => !['amount', 'note', 'category', 'subcategory', 'date'].includes(key))
  ) return null
  return { amount: body.amount, note: body.note, category: body.category, subcategory: body.subcategory as string | null, date: body.date }
}

async function editableExpense(householdId: string, expenseId: string) {
  if (!UUID_PATTERN.test(expenseId)) return { response: json({ error: 'not_found' }, 404) } as const
  const row = await getDb().query.expenses.findFirst({ where: and(eq(schema.expenses.id, expenseId), eq(schema.expenses.householdId, householdId)) })
  if (!row) return { response: json({ error: 'not_found' }, 404) } as const
  if (row.purchaseId) return { response: json({ error: 'receipt_expense', message: 'Výdaj z účtenky se upravuje s nákupem.' }, 409) } as const
  return { row } as const
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const body = await bodyObject(request)
    const input = body && parseInput(body)
    if (!input) return json({ error: 'invalid_expense', message: 'Vyplňte částku, kategorii a datum výdaje.' }, 400)
    const validated = validateExpenseInput(input, todayInPrague())
    if ('error' in validated) return json({ error: 'invalid_expense', message: validated.error }, 400)

    const { expenseId } = await context.params
    const existing = await editableExpense(member.householdId, expenseId)
    if ('response' in existing) return existing.response
    const [row] = await getDb().update(schema.expenses).set({
      amount: validated.expense.amount.toString(),
      note: validated.expense.note,
      category: validated.expense.category,
      subcategory: validated.expense.subcategory,
      date: validated.expense.date,
    }).where(and(eq(schema.expenses.id, expenseId), eq(schema.expenses.householdId, member.householdId))).returning()
    await recordAudit({ householdId: member.householdId, memberId: member.id }, 'expense.updated', {
      amount: validated.expense.amount, category: validated.expense.category, date: validated.expense.date,
    }, expenseId)
    return json({ expense: toMobileExpense(row) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile expense update]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const { expenseId } = await context.params
    const existing = await editableExpense(member.householdId, expenseId)
    if ('response' in existing) return existing.response
    await getDb().delete(schema.expenses).where(and(eq(schema.expenses.id, expenseId), eq(schema.expenses.householdId, member.householdId)))
    await recordAudit({ householdId: member.householdId, memberId: member.id }, 'expense.deleted', {
      amount: Number(existing.row.amount), category: existing.row.category, date: existing.row.date,
    }, expenseId)
    return json({ ok: true })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile expense delete]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
