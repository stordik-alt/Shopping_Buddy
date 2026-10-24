import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { pushToHousehold } from '@/lib/push/deliver'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const report = await pushToHousehold(member.householdId, {
      title: 'ANITKA',
      body: 'Upozornění do telefonu fungují.',
      url: '/?tab=profil',
      tag: 'test',
    }, { onlyUserId: user.id })
    if (report.sent === 0) return json({ error: 'push_not_delivered', message: 'Zkušební upozornění se nepodařilo doručit. Zkontrolujte zařízení a zkuste upozornění znovu zapnout.' }, 409)
    return json({ ok: true })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile test push]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
