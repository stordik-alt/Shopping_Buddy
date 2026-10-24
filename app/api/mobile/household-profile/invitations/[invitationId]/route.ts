import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { recordAudit } from '@/lib/db/audit'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
type Context = { params: Promise<{ invitationId: string }> }

export async function DELETE(request: Request, context: Context) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    if (member.role !== 'owner') return json({ error: 'owner_required', message: 'Jen správce domácnosti může rušit pozvánky.' }, 403)
    const { invitationId } = await context.params
    if (!invitationId || invitationId.length > 128) return json({ error: 'invalid_invitation' }, 400)
    const db = getDb()
    const invitation = await db.query.invitations.findFirst({
      where: and(eq(schema.invitations.id, invitationId), eq(schema.invitations.householdId, member.householdId)),
      columns: { id: true, status: true },
    })
    if (!invitation || invitation.status !== 'pending') return json({ error: 'not_found' }, 404)
    await db.update(schema.invitations).set({ status: 'revoked' }).where(eq(schema.invitations.id, invitation.id))
    await recordAudit({ householdId: member.householdId, memberId: member.id }, 'invitation.revoked', {}, invitation.id)
    return json({ ok: true })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile household invitation DELETE]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
