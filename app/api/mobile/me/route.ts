import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// Read-only "who am I" endpoint for the Expo app. The mobile client signs up, verifies e-mail, signs in
// and out through the existing /api/auth/* handler and sends the session cookie it received back here.
// Authorization stays server-side: the user comes from the session, never from the request, and the
// household is looked up from membership. proxy.ts lists /api/mobile as public only so an unauthenticated
// call gets a JSON 401 instead of a redirect to the sign-in page; this handler does its own check.
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  const { data: session } = await auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'not_signed_in' }, { status: 401, headers: NO_STORE })

  const { id, email, name, emailVerified } = session.user
  // Same rule as the web: an unverified e-mail is reported, never treated as verified.
  const member = await getDb().query.householdMembers.findFirst({ where: eq(schema.householdMembers.userId, id) })
  return NextResponse.json(
    {
      user: { id, email, name, emailVerified: emailVerified === true },
      household: member ? { id: member.householdId, role: member.role } : null,
    },
    { headers: NO_STORE },
  )
}
