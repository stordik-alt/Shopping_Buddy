import { NextResponse } from 'next/server'
import { MobileRequestAuthError, mobileHouseholdForUser, mobileUserFromRequest } from '@/lib/auth/mobile-request'
import { AccountDeletionError, deleteAccountDataForUser } from '@/lib/account-deletion-service'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required', message: 'Účet není připojený k domácnosti.' }, 409)

    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_request' }, 400)
    const input = body as Record<string, unknown>
    if (Object.keys(input).length !== 1 || typeof input.email !== 'string' || input.email.length > 320) return json({ error: 'invalid_request' }, 400)

    const result = await deleteAccountDataForUser({
      typedEmail: input.email,
      userId: user.id,
      userEmail: user.email,
      householdId: member.householdId,
      memberId: member.id,
      role: member.role,
    })
    return json({ ok: true, ...result })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof AccountDeletionError) return json({ error: 'account_deletion_rejected', message: error.message }, error.status)
    console.error('[mobile account deletion]', error)
    return json({ error: 'request_failed', message: 'Účet se nepodařilo smazat.' }, 500)
  }
}
