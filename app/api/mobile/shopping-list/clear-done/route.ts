import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getPrimaryShoppingListId } from '@/lib/db/queries'
import { clearDoneShoppingItemsForHousehold, ShoppingResourceNotFoundError } from '@/lib/shopping-list-service'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    let body: unknown = {}
    try { body = await request.json() } catch { /* Existing callers may omit the optional list id. */ }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_request' }, 400)
    const fields = body as Record<string, unknown>
    if (Object.keys(fields).some((key) => key !== 'listId') || (fields.listId !== undefined && typeof fields.listId !== 'string')) {
      return json({ error: 'invalid_request' }, 400)
    }
    const listId = typeof fields.listId === 'string' ? fields.listId : await getPrimaryShoppingListId(member.householdId)
    return json(await clearDoneShoppingItemsForHousehold(member.householdId, listId))
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof ShoppingResourceNotFoundError) return json({ error: 'not_found' }, 404)
    console.error('[mobile clear done shopping items]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
