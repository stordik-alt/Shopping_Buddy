import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const EXPO_TOKEN = /^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/
const expoEndpoint = (token: string) => `https://exp.host/--/api/v2/push/send?to=${encodeURIComponent(token)}`

function validToken(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 200 && EXPO_TOKEN.test(value)
}

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const token = new URL(request.url).searchParams.get('token')
    if (!validToken(token)) return json({ error: 'invalid_token' }, 400)
    const subscription = await getDb().query.pushSubscriptions.findFirst({
      where: and(eq(schema.pushSubscriptions.memberId, member.id), eq(schema.pushSubscriptions.endpoint, expoEndpoint(token))),
      columns: { id: true },
    })
    return json({ enabled: Boolean(subscription) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile push subscription read]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function PUT(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    let raw: unknown
    try { raw = await request.json() } catch { raw = null }
    const token = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>).token : null
    if (!validToken(token)) return json({ error: 'invalid_token' }, 400)
    await getDb().insert(schema.pushSubscriptions).values({
      householdId: member.householdId,
      memberId: member.id,
      endpoint: expoEndpoint(token),
      p256dh: 'expo',
      auth: 'expo',
    }).onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { householdId: member.householdId, memberId: member.id, p256dh: 'expo', auth: 'expo' } })
    return json({ ok: true })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile push subscription register]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    let raw: unknown
    try { raw = await request.json() } catch { raw = null }
    const token = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>).token : null
    if (!validToken(token)) return json({ error: 'invalid_token' }, 400)
    await getDb().delete(schema.pushSubscriptions).where(and(
      eq(schema.pushSubscriptions.memberId, member.id),
      eq(schema.pushSubscriptions.endpoint, expoEndpoint(token)),
    ))
    return json({ ok: true })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile push subscription remove]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
