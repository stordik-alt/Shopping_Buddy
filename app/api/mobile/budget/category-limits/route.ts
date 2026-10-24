import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { recordAudit } from '@/lib/db/audit'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { isExpenseCategory } from '@/lib/expense-categories'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const rows = await getDb().query.expenseCategoryBudgets.findMany({
      where: eq(schema.expenseCategoryBudgets.householdId, member.householdId),
      columns: { category: true, amount: true },
    })
    return json({ limits: Object.fromEntries(rows.map((row) => [row.category, Number(row.amount)])) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile budget category limits]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_request' }, 400)
    const { category, amount } = body as Record<string, unknown>
    if (Object.keys(body).some((key) => !['category', 'amount'].includes(key)) || typeof category !== 'string' || !isExpenseCategory(category) || (amount !== null && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 99_999_999.99))) {
      return json({ error: 'invalid_limit', message: 'Limit musí být částka větší než 0, nebo null pro jeho odebrání.' }, 400)
    }

    const db = getDb()
    if (amount === null) {
      await db.delete(schema.expenseCategoryBudgets).where(and(eq(schema.expenseCategoryBudgets.householdId, member.householdId), eq(schema.expenseCategoryBudgets.category, category)))
    } else {
      const value = (Math.round(amount * 100) / 100).toString()
      await db.insert(schema.expenseCategoryBudgets).values({ householdId: member.householdId, category, amount: value })
        .onConflictDoUpdate({ target: [schema.expenseCategoryBudgets.householdId, schema.expenseCategoryBudgets.category], set: { amount: value, updatedAt: new Date() } })
    }
    await recordAudit({ householdId: member.householdId, memberId: member.id }, 'budget.category_set', { category, amount })
    const rows = await db.query.expenseCategoryBudgets.findMany({
      where: eq(schema.expenseCategoryBudgets.householdId, member.householdId),
      columns: { category: true, amount: true },
    })
    return json({ limits: Object.fromEntries(rows.map((row) => [row.category, Number(row.amount)])) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile budget category limit update]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
