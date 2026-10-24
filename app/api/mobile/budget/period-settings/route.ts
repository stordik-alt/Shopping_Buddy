import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { periodStartFor, parsePeriodConfig } from '@/lib/budget-period'
import { recordAudit } from '@/lib/db/audit'
import { getDb } from '@/lib/db/client'
import { loadPeriodConfig, periodColumnsOf } from '@/lib/db/period-config'
import * as schema from '@/lib/db/schema'
import { todayInPrague } from '@/lib/today'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const db = getDb()
    const config = await loadPeriodConfig(db, member.householdId)
    const today = todayInPrague()
    return json({ period: config, today, currentPeriodStart: periodStartFor(config, today), canEdit: member.role === 'owner' })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile budget period settings]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    if (member.role !== 'owner') return json({ error: 'forbidden', message: 'Rozpočtové období může měnit jen správce domácnosti.' }, 403)
    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('period' in body)) return json({ error: 'invalid_request' }, 400)
    const parsed = parsePeriodConfig((body as Record<string, unknown>).period)
    if ('error' in parsed) return json({ error: 'invalid_period', message: parsed.error }, 400)
    const db = getDb()
    await db.update(schema.households).set(periodColumnsOf(parsed.config)).where(eq(schema.households.id, member.householdId))
    await recordAudit({ householdId: member.householdId, memberId: member.id }, 'household.updated', { fields: 'period' })
    const today = todayInPrague()
    return json({ period: parsed.config, today, currentPeriodStart: periodStartFor(parsed.config, today), canEdit: true })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile budget period update]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
