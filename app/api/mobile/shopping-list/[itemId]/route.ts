import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { ShoppingInputError } from '@/lib/shopping-input'
import { isShoppingItemUnit, ShoppingResourceNotFoundError, toggleShoppingItemForHousehold, updateShoppingItemForHousehold } from '@/lib/shopping-list-service'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

async function requestHousehold(request: Request) {
  const user = await mobileUserFromRequest(request)
  const member = await mobileHouseholdForUser(user.id)
  return member ? { user, householdId: member.householdId } : null
}

async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function failure(error: unknown) {
  if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
  if (error instanceof ShoppingInputError) return json({ error: error.message }, 400)
  if (error instanceof ShoppingResourceNotFoundError) return json({ error: 'not_found' }, 404)
  console.error('[mobile shopping list item]', error)
  return json({ error: 'request_failed' }, 500)
}

export async function PATCH(request: Request, context: { params: Promise<{ itemId: string }> }) {
  try {
    const authenticated = await requestHousehold(request)
    if (!authenticated) return json({ error: 'household_required' }, 409)
    const body = await bodyObject(request)
    if (!body) throw new ShoppingInputError('Neplatný požadavek.')
    const { itemId } = await context.params

    if (Object.keys(body).length === 1 && typeof body.done === 'boolean') {
      await toggleShoppingItemForHousehold(authenticated.householdId, itemId, body.done)
      return json({ ok: true })
    }

    if (Object.keys(body).some((key) => !['quantity', 'unit'].includes(key)) || Object.keys(body).length === 0) {
      throw new ShoppingInputError('Neplatný požadavek.')
    }
    if (body.quantity !== undefined && typeof body.quantity !== 'number') throw new ShoppingInputError('Množství musí být kladné číslo.')
    if (body.unit !== undefined && !isShoppingItemUnit(body.unit)) throw new ShoppingInputError('Neplatná jednotka.')
    await updateShoppingItemForHousehold(authenticated.householdId, itemId, {
      ...(body.quantity !== undefined && { quantity: body.quantity }),
      ...(body.unit !== undefined && { unit: body.unit }),
    })
    return json({ ok: true })
  } catch (error) {
    return failure(error)
  }
}
