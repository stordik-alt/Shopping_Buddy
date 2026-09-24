import { isNearby, type StoreSelection } from '@/lib/nearby-stores'
import type { ItemCategory } from '@/lib/types'

// Offers of a store for a product the app has no regular price for.
//
// Some retailers publish only their current offers (Penny's website lists its ~40 weekly offers and
// nothing else), so a product can have an active promotion at a chain and no price observation there.
// It has no regular price to compare the offer against and none is invented (CLAUDE.md sections 15
// and 18), so it cannot appear among the price comparisons — this is how it is shown instead: the
// offer price, the store and how long it lasts, with no discount percentage and no comparison.
// Pure and free of UI and database code so it is deterministic and testable (sections 5 and 25).

export type StandaloneOffer = {
  productName: string
  category: ItemCategory
  store: string
  storeId: string
  /** The offer price of one package, as the retailer publishes it. */
  dealPrice: number
  /** Last day the offer is valid (`YYYY-MM-DD`). */
  validUntil: string
}

/** The offers at stores the user has chosen as nearby (everything when nothing is chosen), ordered
 *  by store and then product name so the list does not reshuffle between renders. */
export function nearbyOffers(offers: StandaloneOffer[], selection: StoreSelection): StandaloneOffer[] {
  return offers
    .filter((offer) => isNearby({ storeId: offer.storeId }, selection))
    .sort((a, b) => a.store.localeCompare(b.store, 'cs') || a.productName.localeCompare(b.productName, 'cs'))
}

/** "29. 9." from an ISO date — the way the retailers print an offer's end. */
export function shortOfferDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  return `${Number(day)}. ${Number(month)}.`
}
