import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { BearerAuthError, bearerTokenFrom, requireBearerUser } from '@/lib/auth/bearer'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

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
  let user: { id: string; email: string; name: string; emailVerified: boolean }
  if (bearerTokenFrom(request.headers) !== null || request.headers.has('authorization')) {
    try {
      user = await requireBearerUser(request.headers)
    } catch (error) {
      if (!(error instanceof BearerAuthError)) throw error
      if (error.reason === 'unverified_email') return unauthorized('email_not_verified', 403)
      if (error.reason === 'unavailable') return unauthorized('bearer_unavailable')
      return unauthorized('invalid_token')
    }
  } else {
    const { data: session } = await auth.getSession()
    if (!session?.user) return unauthorized('not_signed_in')
    const { id, email, name, emailVerified } = session.user
    // Same rule as the web: an unverified e-mail is reported, never treated as verified.
    user = { id, email, name, emailVerified: emailVerified === true }
  }

  const member = await getDb().query.householdMembers.findFirst({ where: eq(schema.householdMembers.userId, user.id) })
  return NextResponse.json(
    { user, household: member ? { id: member.householdId, role: member.role } : null },
    { headers: NO_STORE },
  )
}
