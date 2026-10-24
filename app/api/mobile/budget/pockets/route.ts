import { and, eq, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { validatePocketInput, type PocketInput } from '@/lib/pocket-input'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const allowed = ['name', 'icon', 'targetAmount', 'targetDate', 'openingAmount', 'plannedContribution', 'isReserve']
function pocketInput(body: Record<string, unknown>): PocketInput | null {
  if (Object.keys(body).some((key) => !allowed.includes(key)) || typeof body.name !== 'string' || typeof body.icon !== 'string' || typeof body.openingAmount !== 'number' || (body.targetAmount !== null && typeof body.targetAmount !== 'number') || (body.targetDate !== null && typeof body.targetDate !== 'string') || (body.plannedContribution !== null && typeof body.plannedContribution !== 'number') || (body.isReserve !== undefined && typeof body.isReserve !== 'boolean')) return null
  return { name: body.name, icon: body.icon, targetAmount: body.targetAmount as number | null, targetDate: body.targetDate as string | null, openingAmount: body.openingAmount, plannedContribution: body.plannedContribution as number | null, isReserve: body.isReserve === true }
}
function releaseReserve(db: ReturnType<typeof getDb>, householdId: string) {
  return db.update(schema.pockets).set({ isReserve: false }).where(and(eq(schema.pockets.householdId, householdId), eq(schema.pockets.isReserve, true), isNull(schema.pockets.archivedAt)))
}

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!isObject(body)) return json({ error: 'invalid_request' }, 400)
    const input = pocketInput(body)
    if (!input) return json({ error: 'invalid_pocket', message: 'Vyplňte název, ikonu a částky Kapsy.' }, 400)
    const checked = validatePocketInput(input)
    if ('error' in checked) return json({ error: 'invalid_pocket', message: checked.error }, 400)
    const pocket = checked.pocket
    const db = getDb()
    const id = crypto.randomUUID()
    const insert = db.insert(schema.pockets).values({ id, householdId: member.householdId, name: pocket.name, icon: pocket.icon, targetAmount: pocket.targetAmount?.toString() ?? null, targetDate: pocket.targetDate, openingAmount: pocket.openingAmount.toString(), plannedContribution: pocket.plannedContribution?.toString() ?? null, isReserve: pocket.isReserve })
    if (pocket.isReserve) await db.batch([releaseReserve(db, member.householdId), insert])
    else await insert
    return json({ ok: true, id }, 201)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile pocket add]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
