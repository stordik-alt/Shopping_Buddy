import type { Item, ItemCategory, ItemUnit, StoreChain } from '@/lib/types'

export type PriceSourceType = 'RECEIPT' | 'OFFICIAL' | 'FLYER' | 'API' | 'OTHER'
export type PriceScope = 'STORE' | 'STORE_FORMAT' | 'REGION' | 'CHAIN'
export type PriceObservation = {
  price: number
  /** The date this price was observed. */
  recordedAt: string
  /** Set once a different, newer price replaced this one: the date the newer price was first
   *  observed, i.e. the latest this price can have ended. Null/undefined while it is the current
   *  price (or for sources that record no end date). */
  validUntil?: string | null
  sourceType?: PriceSourceType
  priceScope?: PriceScope
}

export type PricePoint = {
  store: StoreChain
  storeId?: string
  storeLocationId?: string | null
  priceScope?: PriceScope
  sourceType?: PriceSourceType
  locationResolution?: 'UNKNOWN' | 'RESOLVED' | 'NOT_APPLICABLE'
  regularPrice: number
  dealPrice?: number
  dealValidUntil?: string
  unit: ItemUnit
  unitPrice: number
  recordedAt: string
  /** Every regular-price observation recorded for this product at this store, oldest first,
   *  including the current one (`regularPrice`/`recordedAt` above). Empty/undefined when only one
   *  observation has ever been recorded — most products today, since `prices` has been seeded
   *  once and never re-observed (docs/01_CURRENT_STATE.md gap: "Price history"). */
  priceHistory?: PriceObservation[]
}

export type ProductPrice = {
  productName: string
  category: ItemCategory
  prices: PricePoint[]
}

export function effectivePrice(price: PricePoint) {
  return price.dealPrice ?? price.regularPrice
}

export function isDealActive(price: PricePoint, referenceDate: string) {
  return price.dealPrice != null && (price.dealValidUntil == null || price.dealValidUntil >= referenceDate)
}

/** The most recent OLDER regular price that differs from the current one — the "old price" — with
 *  the date it was observed and, when known, the date it ended. `null` when the price has never
 *  changed (or only one observation exists). Repeated observations of an unchanged price are
 *  skipped, so this is the price before the last change, not merely the previous day's row. */
export function previousPrice(price: PricePoint): { price: number; recordedAt: string; validUntil: string | null } | null {
  const older = (price.priceHistory ?? [])
    .filter((observation) => observation.recordedAt < price.recordedAt && observation.price !== price.regularPrice)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : a.recordedAt > b.recordedAt ? -1 : 0))
  const latestOld = older[0]
  return latestOld ? { price: latestOld.price, recordedAt: latestOld.recordedAt, validUntil: latestOld.validUntil ?? null } : null
}

/** How far back "nejnižší cena za posledních X dní" looks (spec section 19). */
export const RECENT_LOW_WINDOW_DAYS = 30

export type RecentPriceLow = {
  /** The lowest price (today's or a recorded one) within the window. */
  low: number
  /** 'unchanged' — every observation in the window costs the same as today, nothing to compare;
   *  'at-low' — today's price is the window's lowest, and it *did* change at some point in it;
   *  'above-low' — a cheaper price was recorded within the window than today's. */
  status: 'unchanged' | 'at-low' | 'above-low'
}

/** The lowest price this product has actually been recorded at, at this store, within the last
 *  `windowDays` days (spec section 19: "Nejnižší cena za posledních 30 dní" — real history, never
 *  invented). `null` with no recorded observation in the window to compare today's price against. */
export function recentPriceLow(price: PricePoint, referenceDate: string, windowDays: number = RECENT_LOW_WINDOW_DAYS): RecentPriceLow | null {
  const cutoff = new Date(Date.parse(`${referenceDate}T00:00:00Z`) - windowDays * 86_400_000).toISOString().slice(0, 10)
  const inWindow = (price.priceHistory ?? []).filter((observation) => observation.recordedAt >= cutoff && observation.recordedAt <= referenceDate)
  if (inWindow.length === 0) return null
  const current = effectivePrice(price)
  const historicMin = Math.min(...inWindow.map((observation) => observation.price))
  const low = Math.min(current, historicMin)
  if (inWindow.every((observation) => observation.price === current)) return { low, status: 'unchanged' }
  return { low, status: current <= historicMin ? 'at-low' : 'above-low' }
}

/** Prices for one product across stores, cheapest (effective price) first. */
export function comparePrices(products: ProductPrice[], productName: string) {
  const product = products.find((entry) => entry.productName === productName)
  if (!product) return null
  return { ...product, prices: [...product.prices].sort((a, b) => effectivePrice(a) - effectivePrice(b)) }
}

export function activeDeals(products: ProductPrice[], referenceDate: string) {
  return products.flatMap((product) =>
    product.prices.filter((price) => isDealActive(price, referenceDate)).map((price) => ({ product, price })),
  )
}

export type DealAssessment = {
  product: ProductPrice
  price: PricePoint
  isBestPrice: boolean
  cheapestAlternative: { store: StoreChain; price: number } | null
  /** The last 30 days' lowest recorded price, when there is history to compare against. */
  recentLow: RecentPriceLow | null
}

/** Whether each active deal is actually the best price available for that product across all
 *  known stores, not just a discount off its own regular price. Per docs/05_BUSINESS_RULES.md:
 *  "A promotion is not automatically a good deal just because its percentage discount is large."
 *  A store's "-50%" deal can still be pricier than another store's everyday price. Also notes the
 *  last 30 days' lowest price where history is actually available. */
export function assessDealQuality(products: ProductPrice[], referenceDate: string): DealAssessment[] {
  return activeDeals(products, referenceDate).map(({ product, price }) => {
    const dealEffective = effectivePrice(price)
    const cheapestOverall = product.prices.reduce((min, candidate) => (effectivePrice(candidate) < effectivePrice(min) ? candidate : min))
    const isBestPrice = dealEffective <= effectivePrice(cheapestOverall)
    return {
      product,
      price,
      isBestPrice,
      cheapestAlternative: isBestPrice ? null : { store: cheapestOverall.store, price: effectivePrice(cheapestOverall) },
      recentLow: recentPriceLow(price, referenceDate),
    }
  })
}

/** A deal's discount off its own regular price, as a fraction (0.25 = 25 % off). */
export function dealDiscount(price: PricePoint): number {
  return price.regularPrice > 0 ? 1 - effectivePrice(price) / price.regularPrice : 0
}

/** The unit price at what a shopper actually pays right now (spec section 20/21: "cena za
 *  jednotku" next to the deal price, so differently-sized packages stay comparable). `unitPrice`
 *  on `PricePoint` belongs to the *regular* price; scaled down by the same fraction the deal price
 *  is below it — rounded to haléře, same rule as `lib/product-search.ts`'s `hitUnitPrice()`, which
 *  this mirrors for a `PricePoint` instead of a `ProductSearchHit`. Equal to `unitPrice` with no
 *  active deal. */
export function dealEffectiveUnitPrice(price: PricePoint): number {
  if (price.dealPrice == null || price.regularPrice <= 0) return price.unitPrice
  return Math.round(((price.unitPrice * price.dealPrice) / price.regularPrice) * 100) / 100
}

/** Splits deals into those for products on the household's list — what the home screen shows
 *  first — and the rest. On-list deals keep the list's order, so the product the household added
 *  first comes first; the others go biggest discount first, then by name, so the order is stable.
 *  Names match ignoring case and surrounding spaces, the same way the deals card decides that a
 *  product is already on the list. */
export function dealsForList<T extends { product: ProductPrice; price: PricePoint }>(deals: T[], listNames: string[]): { onList: T[]; others: T[] } {
  const normalize = (name: string) => name.trim().toLowerCase()
  const position = new Map<string, number>()
  listNames.forEach((name, index) => {
    const key = normalize(name)
    if (!position.has(key)) position.set(key, index)
  })
  const onList: T[] = []
  const others: T[] = []
  for (const deal of deals) (position.has(normalize(deal.product.productName)) ? onList : others).push(deal)
  onList.sort((a, b) => position.get(normalize(a.product.productName))! - position.get(normalize(b.product.productName))!)
  others.sort((a, b) => dealDiscount(b.price) - dealDiscount(a.price) || a.product.productName.localeCompare(b.product.productName, 'cs'))
  return { onList, others }
}

export type ShoppingListItemForPricing = Pick<Item, 'name' | 'price' | 'quantity' | 'unit' | 'done' | 'store'>

/** Whether a deal is worth stocking up on beyond the household's immediate need — per
 *  docs/05_BUSINESS_RULES.md's "Bulk buying" rule: "large quantities may be recommended when the
 *  savings are meaningful and the household can reasonably use/store the quantity... do not
 *  optimize price alone." There's no real per-package bulk-pricing data yet (would need product
 *  variant/package-size modeling, `docs/04_ROADMAP.md` Phase C — still open, deliberately not
 *  invented) to know whether a larger pack is genuinely cheaper per unit, so this approximates the
 *  rule with what's real today instead: a deal that's actually the best price right now (not just
 *  a discount), for a product the household is currently low on per its real pantry data. Never
 *  suggests stocking up on something already well-stocked, regardless of how good the price is —
 *  the "not price alone" half of the rule. */
export function suggestsStockingUp(assessment: DealAssessment, currentPantryQuantity: number): boolean {
  return assessment.isBestPrice && currentPantryQuantity <= 1
}

export type StoreTotal = {
  store: StoreChain
  total: number
  /** How many of the not-done items this total is based on a real stored price: an explicitly assigned store price on the item, or a catalog price for that store. */
  itemsPriced: number
  /** How many had neither an explicitly assigned store price nor a catalog price, so the item's own price was used as an estimate. */
  itemsFallback: number
}

/** Total cost of buying every not-yet-done shopping list item in one trip, per store that has at
 *  least some catalog price data — sorted cheapest first. A product with no catalog price at a
 *  given store falls back to the item's own stored price (store-agnostic), so every candidate
 *  store still gets a comparable total instead of being silently excluded. Per
 *  docs/05_BUSINESS_RULES.md, this compares real, already-fetched prices — it never invents one. */
function catalogCostForItem(item: ShoppingListItemForPricing, price: PricePoint): number | null {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) return null

  if (item.unit === 'ks') return Math.round(effectivePrice(price) * item.quantity * 100) / 100

  if ((item.unit === 'kg' || item.unit === 'g') && price.unit === 'kg') {
    const quantityKg = item.unit === 'g' ? item.quantity / 1000 : item.quantity
    return Math.round(dealEffectiveUnitPrice(price) * quantityKg * 100) / 100
  }

  if ((item.unit === 'l' || item.unit === 'ml') && price.unit === 'l') {
    const quantityL = item.unit === 'ml' ? item.quantity / 1000 : item.quantity
    return Math.round(dealEffectiveUnitPrice(price) * quantityL * 100) / 100
  }

  return null
}

export function compareStoreTotals(items: ShoppingListItemForPricing[], products: ProductPrice[]): StoreTotal[] {
  const pending = items.filter((item) => !item.done)
  const stores = new Set<StoreChain>()
  // A store explicitly assigned to a list item is itself a valid candidate even when that item
  // has no matching catalog product. Its stored item price is the real price the user sees in the
  // list and must therefore not disappear from the whole-trip total.
  for (const item of pending) if (item.store) stores.add(item.store)
  for (const product of products) for (const price of product.prices) stores.add(price.store)

  return Array.from(stores)
    .map((store): StoreTotal => {
      let total = 0
      let itemsPriced = 0
      let itemsFallback = 0
      for (const item of pending) {
        // If the user explicitly assigned this item to this store, prefer the price already stored
        // on the shopping-list item. This keeps the whole-list total consistent with the list's
        // own store-group estimate, even when the catalog has no exact product-name match.
        if (item.store === store) {
          total += item.price * item.quantity
          itemsPriced++
          continue
        }

        const product = products.find((entry) => entry.productName === item.name)
        const priceAtStore = product?.prices.find((price) => price.store === store)
        const catalogCost = priceAtStore ? catalogCostForItem(item, priceAtStore) : null
        if (catalogCost != null) {
          total += catalogCost
          itemsPriced++
        } else {
          total += item.price * item.quantity
          itemsFallback++
        }
      }
      return { store, total, itemsPriced, itemsFallback }
    })
    .sort((a, b) => a.total - b.total)
}

/** Theoretical floor: buying each item at whichever known store is cheapest for it specifically,
 *  ignoring the single-trip constraint. A reference point for "best single store" vs. "best possible". */
export function cheapestPossibleTotal(items: ShoppingListItemForPricing[], products: ProductPrice[]): number {
  return items
    .filter((item) => !item.done)
    .reduce((sum, item) => {
      const product = products.find((entry) => entry.productName === item.name)
      if (!product || product.prices.length === 0) return sum + item.price * item.quantity
      const costs = product.prices
        .map((price) => catalogCostForItem(item, price))
        .filter((cost): cost is number => cost != null)
      if (costs.length === 0) return sum + item.price * item.quantity
      return sum + Math.min(...costs)
    }, 0)
}
