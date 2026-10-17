import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import type { BearerUser } from '@/lib/auth/bearer'

// Read-only "who am I" endpoint for the Expo app. The mobile client signs in through /api/auth/*, gets a
// JWT from Neon Auth and sends it as `Authorization: Bearer`; that token is verified here (lib/auth/bearer.ts).
// Without an Authorization header the Neon Auth session cookie is used, as on the web. A request that sends
// a Bearer token is judged by it alone — an invalid token is never rescued by a cookie.
// Authorization stays server-side: the user comes from the verified token or session, never from the request,
// and the household is looked up from membership. proxy.ts lists this path as public only so an
// unauthenticated call gets a JSON 401 instead of a redirect to the sign-in page.
const NO_STORE = { 'Cache-Control': 'no-store' }

const unauthorized = (error: string, status = 401) => NextResponse.json({ error }, { status, headers: NO_STORE })

export async function GET(request: Request) {
  let user: BearerUser
  try {
    user = await mobileUserFromRequest(request)
  } catch (error) {
    if (!(error instanceof MobileRequestAuthError)) throw error
    return unauthorized(error.code, error.status)
  }

  const member = await mobileHouseholdForUser(user.id)
  return NextResponse.json(
    { user, household: member ? { id: member.householdId, role: member.role } : null },
    { headers: NO_STORE },
  )
}
