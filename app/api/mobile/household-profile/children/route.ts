import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return NextResponse.json({ error: 'household_required' }, { status: 409, headers: NO_STORE })
    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE })
    const child = body as Record<string, unknown>
    if (Object.keys(child).some((key) => !['name', 'age', 'preferences', 'specialNeeds'].includes(key)) || typeof child.name !== 'string' || !child.name.trim() || child.name.trim().length > 120 || typeof child.age !== 'number' || !Number.isInteger(child.age) || child.age < 0 || child.age > 21 || typeof child.preferences !== 'string' || !child.preferences.trim() || child.preferences.trim().length > 1000 || (child.specialNeeds !== undefined && (typeof child.specialNeeds !== 'string' || child.specialNeeds.trim().length > 1000))) {
      return NextResponse.json({ error: 'invalid_child', message: 'Vyplňte jméno, věk od 0 do 21 let a preference dítěte.' }, { status: 400, headers: NO_STORE })
    }
    const [row] = await getDb().insert(schema.children).values({
      householdId: member.householdId,
      name: child.name.trim(),
      age: child.age,
      preferences: child.preferences.trim(),
      specialNeeds: typeof child.specialNeeds === 'string' && child.specialNeeds.trim() ? child.specialNeeds.trim() : null,
    }).returning()
    return NextResponse.json({ child: { id: row.id, name: row.name, age: row.age, preferences: row.preferences, specialNeeds: row.specialNeeds ?? undefined } }, { status: 201, headers: NO_STORE })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return NextResponse.json({ error: error.code }, { status: error.status, headers: NO_STORE })
    console.error('[mobile child add]', error)
    return NextResponse.json({ error: 'request_failed' }, { status: 500, headers: NO_STORE })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return NextResponse.json({ error: 'household_required' }, { status: 409, headers: NO_STORE })
    const childId = new URL(request.url).searchParams.get('id')
    if (!childId) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE })
    const db = getDb()
    const [deleted] = await db.delete(schema.children).where(and(eq(schema.children.id, childId), eq(schema.children.householdId, member.householdId))).returning({ id: schema.children.id })
    if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return NextResponse.json({ error: error.code }, { status: error.status, headers: NO_STORE })
    console.error('[mobile child removal]', error)
    return NextResponse.json({ error: 'request_failed' }, { status: 500, headers: NO_STORE })
  }
}
