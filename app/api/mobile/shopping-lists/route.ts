import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { checkRequiredText, LIST_NAME_MAX, ShoppingInputError } from '@/lib/shopping-input'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)

    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_request' }, 400)
    const fields = body as Record<string, unknown>
    if (Object.keys(fields).some((key) => key !== 'name') || typeof fields.name !== 'string') return json({ error: 'invalid_request' }, 400)
    const name = fields.name.trim()
    checkRequiredText(name, 'Název seznamu', LIST_NAME_MAX)

    const db = getDb()
    const existing = await db.query.shoppingLists.findFirst({
      where: and(eq(schema.shoppingLists.householdId, member.householdId), eq(schema.shoppingLists.name, name)),
      columns: { id: true },
    })
    if (existing) return json({ error: 'already_exists', message: 'Seznam s tímto názvem už existuje.' }, 409)

    const [list] = await db.insert(schema.shoppingLists).values({ householdId: member.householdId, name }).returning({ id: schema.shoppingLists.id, name: schema.shoppingLists.name })
    return json({ list }, 201)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof ShoppingInputError) return json({ error: error.message }, 400)
    console.error('[mobile shopping lists]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
