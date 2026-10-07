import { money } from '@/lib/format'
import { isNearby, type StoreSelection } from '@/lib/nearby-stores'
import { effectivePrice, type ProductPrice } from '@/lib/prices'
import { toComparableUnit } from '@/lib/product-search'
import type { ItemCategory, ItemUnit } from '@/lib/types'

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
  /** The offer's price per `unit`, so it can be compared per kg/l/ks; `null` for an offer stored
   *  before unit prices were kept (none is invented for it). */
  unit: ItemUnit | null
  unitPrice: number | null
  /** Last day the offer is valid (`YYYY-MM-DD`). */
  validUntil: string
}

/** "159,90 Kč/kg" — the offer's unit price in a comparable unit (per gram becomes per kg), or `null`
 *  when the offer has none. */
export function offerUnitPriceLabel(offer: Pick<StandaloneOffer, 'unit' | 'unitPrice'>): string | null {
  if (offer.unit == null || offer.unitPrice == null) return null
  const comparable = toComparableUnit(offer.unit, offer.unitPrice)
  return `${money(comparable.unitPrice)}/${comparable.unit}`
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

/** The product-name key the app matches offers to a shopping-list item by: the same
 *  case/whitespace-insensitive comparison `dealsForList()`/`bestDealByName()` use. */
const nameKey = (name: string) => name.trim().toLowerCase()

/** Every running offer for one product, cheapest first (ties by chain, so the order is stable) —
 *  what the item's own detail shows next to the price comparison, which is empty for a product the
 *  app has no regular price for. */
export function offersForProduct(offers: StandaloneOffer[], productName: string): StandaloneOffer[] {
  const key = nameKey(productName)
  return offers
    .filter((offer) => nameKey(offer.productName) === key)
    .sort((a, b) => a.dealPrice - b.dealPrice || a.store.localeCompare(b.store, 'cs'))
}

/** The cheapest running offer per product name, keyed like `bestDealByName()` — what a shopping-list
 *  row shows for a product the app knows only from an offer. Ties keep the first offer. */
export function bestOfferByName(offers: StandaloneOffer[]): Map<string, StandaloneOffer> {
  const best = new Map<string, StandaloneOffer>()
  for (const offer of offers) {
    const key = nameKey(offer.productName)
    const current = best.get(key)
    if (!current || offer.dealPrice < current.dealPrice) best.set(key, offer)
  }
  return best
}

/** One promotion as a shopping-list row states it — the same three facts for a deal and for an offer,
 *  because both are a price the chain runs today. */
export type RowPromotion = { store: string; price: number; validUntil: string | null }

/** The promotion a row shows for one item: the cheaper of its running deal and its running offer. A
 *  product can have both (a chain the app has a regular price for, and an offers-only one), and the
 *  row says nothing but "akce v <store> za <price> do <date>" — no discount, which neither shape
 *  guarantees — so the cheaper one is the one worth showing. `null` when the item has neither. */
export function cheaperPromotion(deal: RowPromotion | null, offer: RowPromotion | null): RowPromotion | null {
  if (deal == null) return offer
  if (offer == null) return deal
  return offer.price < deal.price ? offer : deal
}

/** Whether an offer is at most as dear as every price the app already knows for the same product —
 *  the same bar `assessDealQuality()` sets for a deal ("a promotion is not automatically a good deal",
 *  docs/05_BUSINESS_RULES.md), applied to an offer whose own regular price is unknown. True when no
 *  price is known at all: an offers-only retailer's offer is then the only price there is. */
export function offerBeatsKnownPrices(offer: StandaloneOffer, knownPrices: ProductPrice[]): boolean {
  const cheapest = knownPrices
    .flatMap((product) => product.prices)
    .reduce<number | null>((min, price) => {
      const effective = effectivePrice(price)
      return min == null || effective < min ? effective : min
    }, null)
  return cheapest == null || offer.dealPrice <= cheapest
}
