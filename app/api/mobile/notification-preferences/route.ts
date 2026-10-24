import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { isNotificationKind, NOTIFICATION_KINDS } from '@/lib/notification-kinds'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return NextResponse.json({ error: 'household_required' }, { status: 409, headers: NO_STORE })
    const rows = await getDb().select({ kind: schema.memberNotificationSettings.kind, enabled: schema.memberNotificationSettings.enabled })
      .from(schema.memberNotificationSettings).where(eq(schema.memberNotificationSettings.memberId, member.id))
    const saved = new Map(rows.map((row) => [row.kind, row.enabled]))
    return NextResponse.json({ preferences: NOTIFICATION_KINDS.map(({ key, label, description }) => ({ key, label, description, enabled: saved.get(key) ?? true })) }, { headers: NO_STORE })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return NextResponse.json({ error: error.code }, { status: error.status, headers: NO_STORE })
    console.error('[mobile notification preferences]', error)
    return NextResponse.json({ error: 'request_failed' }, { status: 500, headers: NO_STORE })
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return NextResponse.json({ error: 'household_required' }, { status: 409, headers: NO_STORE })
    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE })
    const { kind, enabled } = body as Record<string, unknown>
    if (!isNotificationKind(kind) || typeof enabled !== 'boolean') return NextResponse.json({ error: 'invalid_preference' }, { status: 400, headers: NO_STORE })
    await getDb().insert(schema.memberNotificationSettings).values({ memberId: member.id, kind, enabled, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [schema.memberNotificationSettings.memberId, schema.memberNotificationSettings.kind], set: { enabled, updatedAt: new Date() } })
    return NextResponse.json({ kind, enabled }, { headers: NO_STORE })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return NextResponse.json({ error: error.code }, { status: error.status, headers: NO_STORE })
    console.error('[mobile notification preference update]', error)
    return NextResponse.json({ error: 'request_failed' }, { status: 500, headers: NO_STORE })
  }
}
