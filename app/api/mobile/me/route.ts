import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { recordAudit } from '@/lib/db/audit'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
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
  const db = getDb()
  const household = member && db.query.households ? await db.query.households.findFirst({
    where: eq(schema.households.id, member.householdId),
    columns: { id: true, name: true, monthlyBudget: true, currency: true },
  }) : null
  const householdProfile = member
    ? household
      ? { id: member.householdId, role: member.role, name: household.name, monthlyBudget: Number(household.monthlyBudget), currency: household.currency }
      : { id: member.householdId, role: member.role }
    : null
  return NextResponse.json(
    { user, household: householdProfile },
    { headers: NO_STORE },
  )
}

export async function PATCH(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return NextResponse.json({ error: 'household_required' }, { status: 409, headers: NO_STORE })
    if (member.role !== 'owner') return NextResponse.json({ error: 'owner_required', message: 'Nastavení domácnosti může měnit jen správce domácnosti.' }, { status: 403, headers: NO_STORE })

    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE })
    const changes = body as Record<string, unknown>
    if (Object.keys(changes).length === 0 || Object.keys(changes).some((key) => !['name', 'monthlyBudget'].includes(key))) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE })
    }
    let name: string | undefined
    if (changes.name !== undefined) {
      if (typeof changes.name !== 'string' || !changes.name.trim() || changes.name.trim().length > 120) {
        return NextResponse.json({ error: 'invalid_name', message: 'Název musí mít 1 až 120 znaků.' }, { status: 400, headers: NO_STORE })
      }
      name = changes.name.trim()
    }
    let monthlyBudget: number | undefined
    if (changes.monthlyBudget !== undefined) {
      if (typeof changes.monthlyBudget !== 'number' || !Number.isFinite(changes.monthlyBudget) || changes.monthlyBudget < 0 || changes.monthlyBudget > 100_000_000) {
        return NextResponse.json({ error: 'invalid_budget', message: 'Rozpočet musí být částka od 0 do 100 000 000.' }, { status: 400, headers: NO_STORE })
      }
      monthlyBudget = Math.round(changes.monthlyBudget * 100) / 100
    }
    const db = getDb()
    await db.update(schema.households).set({
      ...(name !== undefined ? { name } : {}),
      ...(monthlyBudget !== undefined ? { monthlyBudget: monthlyBudget.toString() } : {}),
    }).where(eq(schema.households.id, member.householdId))
    await recordAudit({ householdId: member.householdId, memberId: member.id }, 'household.updated', {
      fields: [name !== undefined && 'name', monthlyBudget !== undefined && 'monthlyBudget'].filter(Boolean).join(','),
      ...(monthlyBudget !== undefined && { amount: monthlyBudget }),
    })
    const household = await db.query.households.findFirst({ where: eq(schema.households.id, member.householdId), columns: { id: true, name: true, monthlyBudget: true, currency: true } })
    return NextResponse.json({ household: household ? { ...household, monthlyBudget: Number(household.monthlyBudget), role: member.role } : null }, { headers: NO_STORE })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return NextResponse.json({ error: error.code }, { status: error.status, headers: NO_STORE })
    console.error('[mobile profile update]', error)
    return NextResponse.json({ error: 'request_failed' }, { status: 500, headers: NO_STORE })
  }
}
