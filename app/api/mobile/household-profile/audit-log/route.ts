import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { listAuditLog } from '@/lib/db/audit'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    if (member.role !== 'owner') return json({ error: 'owner_required', message: 'Historii změn vidí jen správce domácnosti.' }, 403)
    return json({ entries: await listAuditLog(member.householdId, 100) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile household audit log]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
