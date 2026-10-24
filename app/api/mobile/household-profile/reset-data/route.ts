import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { confirmsHouseholdName, DATA_RESET_LABELS, normalizeResetGroups } from '@/lib/data-reset'
import { recordAudit } from '@/lib/db/audit'
import { getDb } from '@/lib/db/client'
import { resetHouseholdData } from '@/lib/db/data-reset'
import { hitRateLimit } from '@/lib/db/rate-limit'
import * as schema from '@/lib/db/schema'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    if (member.role !== 'owner') return json({ error: 'owner_required', message: 'Data domácnosti smí smazat jen správce domácnosti.' }, 403)

    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_request' }, 400)
    const input = body as Record<string, unknown>
    if (Object.keys(input).some((key) => !['groups', 'typedName'].includes(key)) || !Array.isArray(input.groups) || typeof input.typedName !== 'string') return json({ error: 'invalid_request' }, 400)
    const groups = normalizeResetGroups(input.groups)
    if (groups.length === 0) return json({ error: 'empty_selection', message: 'Vyberte, co chcete smazat.' }, 400)

    const household = await getDb().query.households.findFirst({ where: eq(schema.households.id, member.householdId), columns: { name: true } })
    if (!household || !confirmsHouseholdName(input.typedName, household.name)) return json({ error: 'confirmation_mismatch', message: 'Zadaný název neodpovídá názvu domácnosti.' }, 400)
    const rate = await hitRateLimit(`reset-data:${user.id}`, { max: 5, windowMs: 600_000 })
    if (!rate.allowed) return json({ error: 'rate_limited', message: 'Příliš mnoho pokusů, zkuste to za chvíli.' }, 429)

    const result = await resetHouseholdData(member.householdId, groups)
    await recordAudit({ householdId: member.householdId, memberId: member.id }, 'data.reset', { groups: groups.map((group) => DATA_RESET_LABELS[group].title).join(', ') })
    return json({ ok: true, ...result }, 200)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile household data reset]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
