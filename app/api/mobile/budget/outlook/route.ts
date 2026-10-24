import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import { loadBudgetOutlook } from '@/lib/db/period-ledger'
import { loadPeriodConfig } from '@/lib/db/period-config'
import * as schema from '@/lib/db/schema'
import { periodStartFor } from '@/lib/budget-period'
import { isIsoDate } from '@/lib/income-input'
import { validatePlannedCarry } from '@/lib/planned-carry-input'
import { todayInPrague } from '@/lib/today'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const db = getDb()
    const config = await loadPeriodConfig(db, member.householdId)
    return json({ outlook: await loadBudgetOutlook(db, member.householdId, config, todayInPrague()) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile budget outlook]', error)
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
    const input = body as Record<string, unknown>
    if (Object.keys(input).some((key) => !['periodStart', 'amount'].includes(key)) || typeof input.periodStart !== 'string' || (input.amount !== null && typeof input.amount !== 'number')) return json({ error: 'invalid_carry', message: 'Vyplňte platné období a částku převodu.' }, 400)
    const db = getDb()
    const config = await loadPeriodConfig(db, member.householdId)
    const today = todayInPrague()
    if (!isIsoDate(input.periodStart)) return json({ error: 'invalid_carry', message: 'Neplatné období.' }, 400)
    const valid = validatePlannedCarry({ periodStart: periodStartFor(config, input.periodStart), amount: input.amount as number | null }, periodStartFor(config, today))
    if ('error' in valid) return json({ error: 'invalid_carry', message: valid.error }, 400)
    if (valid.amount === null) await db.delete(schema.plannedCarries).where(and(eq(schema.plannedCarries.householdId, member.householdId), eq(schema.plannedCarries.periodStart, valid.periodStart)))
    else await db.insert(schema.plannedCarries).values({ householdId: member.householdId, periodStart: valid.periodStart, amount: valid.amount.toString() }).onConflictDoUpdate({ target: [schema.plannedCarries.householdId, schema.plannedCarries.periodStart], set: { amount: valid.amount.toString() } })
    return json({ ok: true })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile budget planned carry]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
