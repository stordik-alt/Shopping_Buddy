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
    const listId = await getPrimaryShoppingListId(member.householdId)
    return json(await clearDoneShoppingItemsForHousehold(member.householdId, listId))
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof ShoppingResourceNotFoundError) return json({ error: 'not_found' }, 404)
    console.error('[mobile clear done shopping items]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
