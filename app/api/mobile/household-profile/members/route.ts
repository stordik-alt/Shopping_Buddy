import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { recordAudit } from '@/lib/db/audit'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json()
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
  } catch { return null }
}

function safeList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 100 || value.some((item) => typeof item !== 'string' || item.trim().length > 1000)) return null
  return value.map((item) => item.trim()).filter(Boolean)
}

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const actor = await mobileHouseholdForUser(user.id)
    if (!actor) return json({ error: 'household_required' }, 409)
    const body = await bodyObject(request)
    if (!body || Object.keys(body).some((key) => !['name', 'age', 'favoriteFoods', 'dislikedFoods', 'allergies'].includes(key))) return json({ error: 'invalid_request' }, 400)
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120 || typeof body.age !== 'number' || !Number.isInteger(body.age) || body.age < 0 || body.age > 120) return json({ error: 'invalid_member', message: 'Zadejte jméno a věk od 0 do 120 let.' }, 400)
    const favoriteFoods = safeList(body.favoriteFoods ?? [])
    const dislikedFoods = safeList(body.dislikedFoods ?? [])
    const allergies = safeList(body.allergies ?? [])
    if (!favoriteFoods || !dislikedFoods || !allergies) return json({ error: 'invalid_member', message: 'Seznamy mohou obsahovat nejvýše 100 textových hodnot.' }, 400)
    const db = getDb()
    const [row] = await db.insert(schema.householdMembers).values({ householdId: actor.householdId, name: body.name.trim(), role: 'member' }).returning()
    await db.insert(schema.profiles).values({ memberId: row.id, age: body.age, favoriteFoods, dislikedFoods, allergies })
    await recordAudit({ householdId: actor.householdId, memberId: actor.id }, 'member.added', {}, row.id)
    return json({ member: { id: row.id, name: row.name, role: row.role, age: body.age, favoriteFoods, dislikedFoods, allergies, diet: { diet: 'none', avoids: [] }, removable: true } }, 201)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile household member add]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
