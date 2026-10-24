import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import { loadPeriodHistory } from '@/lib/db/period-ledger'
import { loadPeriodConfig } from '@/lib/db/period-config'
import { todayInPrague } from '@/lib/today'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const db = getDb()
    const config = await loadPeriodConfig(db, member.householdId)
    return json({ history: await loadPeriodHistory(db, member.householdId, config, todayInPrague()) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile budget history]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
