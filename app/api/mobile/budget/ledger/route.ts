import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { maxDeposit } from '@/lib/budget-closing'
import { periodStartFor } from '@/lib/budget-period'
import { getDb } from '@/lib/db/client'
import { loadBudgetLedger, loadPeriodBalance } from '@/lib/db/period-ledger'
import { loadPeriodConfig } from '@/lib/db/period-config'
import { isIsoDate } from '@/lib/income-input'
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
    const requested = new URL(request.url).searchParams.get('period') ?? today
    if (!isIsoDate(requested)) return json({ error: 'invalid_period' }, 400)
    const start = periodStartFor(config, requested)
    const [ledger, balance] = await Promise.all([
      loadBudgetLedger(db, member.householdId, config, start, today),
      loadPeriodBalance(db, member.householdId, config, periodStartFor(config, today)),
    ])
    return json({ ...ledger, availableToSave: maxDeposit(balance), currentPeriodStart: periodStartFor(config, today) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile budget ledger]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
