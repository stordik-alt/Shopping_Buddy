import { and, desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const notifications = await getDb().query.notifications.findMany({
      where: and(eq(schema.notifications.householdId, member.householdId), eq(schema.notifications.unread, true)),
      orderBy: [desc(schema.notifications.createdAt)],
      limit: 50,
      columns: { id: true, title: true, detail: true, unread: true, kind: true },
    })
    const muted = await getDb().select({ kind: schema.memberNotificationSettings.kind })
      .from(schema.memberNotificationSettings)
      .where(and(eq(schema.memberNotificationSettings.memberId, member.id), eq(schema.memberNotificationSettings.enabled, false)))
    const mutedKinds = new Set(muted.map((row) => row.kind))
    return json({ notifications: notifications.filter((notification) => !notification.kind || !mutedKinds.has(notification.kind)) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile notifications]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const id = new URL(request.url).searchParams.get('id')
    const condition = id
      ? and(eq(schema.notifications.householdId, member.householdId), eq(schema.notifications.id, id))
      : eq(schema.notifications.householdId, member.householdId)
    await getDb().delete(schema.notifications).where(condition)
    return json({ ok: true })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile notifications]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
