import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { PantryInputError, PantryResourceNotFoundError, updatePantryItemForHousehold } from '@/lib/pantry-mobile-mutations'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ itemId: string }> }) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)

    const body = await bodyObject(request)
    if (!body || Object.keys(body).length !== 1) return json({ error: 'invalid_request' }, 400)
    const { itemId } = await context.params
    if (typeof body.quantity === 'number') {
      await updatePantryItemForHousehold(member.householdId, itemId, { quantity: body.quantity })
    } else if (typeof body.placeKey === 'string') {
      await updatePantryItemForHousehold(member.householdId, itemId, { placeKey: body.placeKey })
    } else {
      return json({ error: 'invalid_request' }, 400)
    }
    return json({ ok: true })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof PantryInputError) return json({ error: error.message }, 400)
    if (error instanceof PantryResourceNotFoundError) return json({ error: 'not_found' }, 404)
    console.error('[mobile pantry item]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
