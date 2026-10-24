import { randomBytes } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { recordAudit } from '@/lib/db/audit'
import { getDb } from '@/lib/db/client'
import { hitRateLimit } from '@/lib/db/rate-limit'
import * as schema from '@/lib/db/schema'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch { return null }
}

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const invitations = await getDb().query.invitations.findMany({
      where: and(eq(schema.invitations.householdId, member.householdId), eq(schema.invitations.status, 'pending')),
      orderBy: desc(schema.invitations.createdAt),
      columns: { id: true, email: true, expiresAt: true },
    })
    return json({ invitations: invitations.map((invitation) => ({ ...invitation, expiresAt: invitation.expiresAt.toString() })) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile household invitations GET]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    if (member.role !== 'owner') return json({ error: 'owner_required', message: 'Jen správce domácnosti může zvát nové členy.' }, 403)
    const body = await bodyObject(request)
    if (!body || Object.keys(body).length !== 1 || typeof body.email !== 'string') return json({ error: 'invalid_request' }, 400)
    const email = body.email.trim().toLowerCase()
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'invalid_email', message: 'Zadejte platnou e-mailovou adresu.' }, 400)
    const rate = await hitRateLimit(`invite:${member.householdId}:${user.id}`, { max: 5, windowMs: 60_000 })
    if (!rate.allowed) return json({ error: 'invite_rate_limit', message: 'Příliš mnoho pozvánek za krátkou dobu. Zkuste to prosím později.' }, 429)

    const token = randomBytes(24).toString('base64url')
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS)
    const [invitation] = await getDb().insert(schema.invitations).values({
      householdId: member.householdId,
      email,
      token,
      invitedByMemberId: member.id,
      expiresAt,
    }).returning({ id: schema.invitations.id, email: schema.invitations.email, expiresAt: schema.invitations.expiresAt })
    await recordAudit({ householdId: member.householdId, memberId: member.id }, 'invitation.created', {}, invitation.id)
    return json({ invitation: { ...invitation, expiresAt: invitation.expiresAt.toString() }, token, url: `${new URL(request.url).origin}/invite/${token}` }, 201)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile household invitations POST]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
