import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getMemberStoreSelection } from '@/lib/db/member-store-preferences'
import { getHouseholdPurchaseHistory, getMobileBudgetState, getPantryItems, getPendingReceiptImports, getShoppingListState } from '@/lib/db/queries'
import { getProductPricesCached, getStandaloneOffersCached } from '@/lib/db/cached-reads'
import { getRestockDismissals, getRestockSuggestionsFor, getStockLevels } from '@/lib/db/restock'
import { filterPricesToNearby } from '@/lib/nearby-stores'
import { nearbyOffers } from '@/lib/offers'
import { attentionItems } from '@/lib/attention'
import { estimatePantry } from '@/lib/pantry-estimate'
import { needsCheck } from '@/lib/pantry'
import { todayInPrague } from '@/lib/today'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)

    const today = todayInPrague()
    const [list, pantry, purchases, receipts, budget, selection, levels] = await Promise.all([
      getShoppingListState(member.householdId),
      getPantryItems(member.householdId),
      getHouseholdPurchaseHistory(member.householdId),
      getPendingReceiptImports(member.householdId),
      getMobileBudgetState(member.householdId, today),
      getMemberStoreSelection(member.id),
      getStockLevels(member.householdId),
    ])
    const pendingItems = list.items.filter((item) => !item.done)
    const names = pendingItems.map((item) => item.name)
    const [priceRows, offers, restockDismissed] = await Promise.all([
      getProductPricesCached({ names, runningDeals: false }),
      getStandaloneOffersCached(),
      getRestockDismissals(member.householdId, today),
    ])
    const productPrices = filterPricesToNearby(priceRows, selection)
    const nearbyOfferRows = nearbyOffers(offers, selection)
    const nameKeys = new Set(names.map((name) => name.trim().toLowerCase()))
    const listOffers = nearbyOfferRows.filter((offer) => nameKeys.has(offer.productName.trim().toLowerCase()))
    const estimates = estimatePantry(pantry, purchases, today)
    const likelyGone = new Set([...estimates].filter(([, estimate]) => estimate.likelyGone).map(([id]) => id))
    const pantryToCheck = pantry.filter((item) => needsCheck(item, likelyGone)).length
    const restockSuggestions = await getRestockSuggestionsFor(levels, pantry, today, selection)
    const daysLeft = Math.max(1, Math.floor((Date.parse(`${budget.period.end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) + 1)
    return json({
      today,
      budget,
      weeklyAllowance: budget.remaining > 0 ? budget.remaining * Math.min(7, daysLeft) / daysLeft : null,
      list: { remaining: pendingItems.length, completed: list.items.length - pendingItems.length, pendingNames: names.slice(0, 3) },
      pantryItemCount: pantry.length,
      pantryToCheck,
      attention: attentionItems({ today, receipts, productPrices, listNames: names }).map(({ id, kind, text, focus }) => ({ id, kind, text, focus })),
      restockSuggestions,
      restockDismissed,
      productPrices,
      offers: listOffers,
    })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile dashboard]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
