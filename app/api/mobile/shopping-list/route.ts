import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getPrimaryShoppingListId, getShoppingListState } from '@/lib/db/queries'
import { checkRequiredText, ITEM_NAME_MAX, ShoppingInputError } from '@/lib/shopping-input'
import { addShoppingItemForHousehold, isShoppingItemUnit, ShoppingResourceNotFoundError } from '@/lib/shopping-list-service'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

async function requestHousehold(request: Request) {
  const user = await mobileUserFromRequest(request)
  const member = await mobileHouseholdForUser(user.id)
  return member ? { user, householdId: member.householdId } : null
}

async function failure(error: unknown) {
  if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
  if (error instanceof ShoppingInputError) return json({ error: error.message }, 400)
  if (error instanceof ShoppingResourceNotFoundError) return json({ error: 'not_found' }, 404)
  console.error('[mobile shopping list]', error)
  return json({ error: 'request_failed' }, 500)
}

async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  try {
    const context = await requestHousehold(request)
    if (!context) return json({ error: 'household_required' }, 409)
    return json(await getShoppingListState(context.householdId))
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  try {
    const context = await requestHousehold(request)
    if (!context) return json({ error: 'household_required' }, 409)
    const body = await bodyObject(request)
    if (!body) throw new ShoppingInputError('Neplatný požadavek.')
    if (Object.keys(body).some((key) => !['name', 'quantity', 'unit', 'clientId'].includes(key))) {
      throw new ShoppingInputError('Neplatný požadavek.')
    }
    if (typeof body.name !== 'string') throw new ShoppingInputError('Název položky je povinný údaj.')
    checkRequiredText(body.name, 'Název položky', ITEM_NAME_MAX)
    if (body.quantity !== undefined && typeof body.quantity !== 'number') throw new ShoppingInputError('Množství musí být kladné číslo.')
    if (body.unit !== undefined && !isShoppingItemUnit(body.unit)) throw new ShoppingInputError('Neplatná jednotka.')
    if (body.clientId !== undefined && typeof body.clientId !== 'string') throw new ShoppingInputError('Neplatný identifikátor položky.')

    const listId = await getPrimaryShoppingListId(context.householdId)
    const result = await addShoppingItemForHousehold(
      context.householdId,
      context.user.id,
      listId,
      body.name,
      {
        ...(body.quantity !== undefined && { quantity: body.quantity }),
        ...(body.unit !== undefined && { unit: body.unit }),
      },
      body.clientId,
    )
    return json(result, 201)
  } catch (error) {
    return failure(error)
  }
}
