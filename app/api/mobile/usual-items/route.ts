import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getHouseholdPurchaseHistory, getPantryItems, getShoppingListState } from '@/lib/db/queries'
import { todayInPrague } from '@/lib/today'
import { suggestUsualItems } from '@/lib/usual-items'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)

    const householdId = member.householdId
    const requestedListId = new URL(request.url).searchParams.get('listId')
    const [purchases, pantryItems, list] = await Promise.all([
      getHouseholdPurchaseHistory(householdId),
      getPantryItems(householdId),
      requestedListId ? getShoppingListState(householdId, requestedListId) : getShoppingListState(householdId),
    ])
    if (!list) return json({ error: 'not_found' }, 404)
    return json({ suggestions: suggestUsualItems({
      purchases,
      today: todayInPrague(),
      onList: list.items.filter((item) => !item.done).map((item) => item.name),
      inPantry: pantryItems.map((item) => item.name),
    }) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile usual items]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
