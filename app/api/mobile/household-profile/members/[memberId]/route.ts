import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { cleanMemberDiet } from '@/lib/diet'
import { recordAudit } from '@/lib/db/audit'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { canRemoveMember } from '@/lib/household-members'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
type Context = { params: Promise<{ memberId: string }> }

async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json()
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
  } catch { return null }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await mobileUserFromRequest(request)
    const actor = await mobileHouseholdForUser(user.id)
    if (!actor) return json({ error: 'household_required' }, 409)
    const { memberId } = await context.params
    const body = await bodyObject(request)
    if (!body || Object.keys(body).length !== 2 || !('diet' in body) || !('avoids' in body)) return json({ error: 'invalid_request' }, 400)
    const diet = cleanMemberDiet({ diet: body.diet, avoids: body.avoids })
    if (!diet) return json({ error: 'invalid_diet', message: 'Vyberte platný způsob stravování a omezení.' }, 400)
    const db = getDb()
    const target = await db.query.householdMembers.findFirst({ where: and(eq(schema.householdMembers.id, memberId), eq(schema.householdMembers.householdId, actor.householdId)), columns: { id: true } })
    if (!target) return json({ error: 'not_found' }, 404)
    await db.insert(schema.memberDiets).values({ memberId, diet: diet.diet, avoids: diet.avoids })
      .onConflictDoUpdate({ target: schema.memberDiets.memberId, set: { diet: diet.diet, avoids: diet.avoids, updatedAt: new Date() } })
    return json({ diet })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile member diet update]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const user = await mobileUserFromRequest(request)
    const actor = await mobileHouseholdForUser(user.id)
    if (!actor) return json({ error: 'household_required' }, 409)
    const { memberId } = await context.params
    const db = getDb()
    const target = await db.query.householdMembers.findFirst({ where: and(eq(schema.householdMembers.id, memberId), eq(schema.householdMembers.householdId, actor.householdId)), columns: { id: true, role: true, userId: true } })
    if (!target) return json({ error: 'not_found' }, 404)
    if (!canRemoveMember({ role: actor.role, memberId: actor.id }, target)) return json({ error: 'member_removal_forbidden', message: 'Tohoto člena nemůžete odebrat.' }, 403)
    await db.delete(schema.householdMembers).where(eq(schema.householdMembers.id, memberId))
    await recordAudit({ householdId: actor.householdId, memberId: actor.id }, 'member.removed', {}, memberId)
    return json({ ok: true })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile household member removal]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
