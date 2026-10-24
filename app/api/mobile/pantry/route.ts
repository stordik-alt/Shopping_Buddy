import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { getMobilePantryState, restockPantryItem } from '@/lib/db/queries'
import { customPlaceIdFromKey, PANTRY_LOCATIONS } from '@/lib/pantry'
import { ITEM_UNITS } from '@anitka/shared/units'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    return json(await getMobilePantryState(member.householdId))
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile pantry]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const body = await bodyObject(request)
    if (!body || typeof body.name !== 'string' || typeof body.quantity !== 'number' || typeof body.unit !== 'string' || typeof body.category !== 'string') {
      return json({ error: 'invalid_pantry_item', message: 'Vyplňte název, množství, jednotku a kategorii.' }, 400)
    }
    const name = body.name.trim()
    const categories = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']
    if (!name || name.length > 200) return json({ error: 'invalid_pantry_item', message: 'Zadejte platný název položky.' }, 400)
    if (!Number.isFinite(body.quantity) || body.quantity <= 0 || body.quantity > 1_000_000) return json({ error: 'invalid_pantry_item', message: 'Množství musí být větší než 0.' }, 400)
    if (!(ITEM_UNITS as readonly string[]).includes(body.unit)) return json({ error: 'invalid_pantry_item', message: 'Vyberte platnou jednotku.' }, 400)
    if (!categories.includes(body.category)) return json({ error: 'invalid_pantry_item', message: 'Vyberte platnou kategorii.' }, 400)

    const placeKey = typeof body.placeKey === 'string' ? body.placeKey : 'Spíž'
    const customPlaceId = customPlaceIdFromKey(placeKey)
    if (customPlaceId) {
      const place = await getDb().query.pantryPlaces.findFirst({ where: and(eq(schema.pantryPlaces.id, customPlaceId), eq(schema.pantryPlaces.householdId, member.householdId)), columns: { id: true } })
      if (!place) {
        return json({ error: 'invalid_place', message: 'Vlastní místo nenalezeno.' }, 400)
      }
    } else if (!(PANTRY_LOCATIONS as readonly string[]).includes(placeKey)) {
      return json({ error: 'invalid_place', message: 'Vyberte platné místo.' }, 400)
    }

    await restockPantryItem(member.householdId, {
      productId: null,
      name,
      quantity: body.quantity,
      unit: body.unit as typeof ITEM_UNITS[number],
      category: body.category as 'Potraviny' | 'Drogerie' | 'Děti' | 'Domácnost' | 'Ostatní',
      location: customPlaceId ? 'Spíž' : placeKey as typeof PANTRY_LOCATIONS[number],
      customPlaceId,
    })
    return json({ ok: true }, 201)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile pantry add]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
