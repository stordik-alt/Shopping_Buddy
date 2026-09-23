import type { Item, ItemCategory, ItemUnit, StoreChain } from '@/lib/types'

export type PriceSourceType = 'RECEIPT' | 'OFFICIAL' | 'FLYER' | 'API' | 'OTHER'
export type PriceScope = 'STORE' | 'STORE_FORMAT' | 'REGION' | 'CHAIN'
export type PriceObservation = { price: number; recordedAt: string; sourceType?: PriceSourceType; priceScope?: PriceScope }

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

/** Whether today's effective price matches or beats every regular price this product has actually
 *  been recorded at, at this store, before today — a genuine historic low rather than merely
 *  cheaper than today's own regular price. Per docs/05_BUSINESS_RULES.md, "historical price" is
 *  one of the factors a promotion assessment should consider. Always false with no recorded prior
 *  observation to compare against — this is awareness of real history, not a guess. */
export function isHistoricLow(price: PricePoint): boolean {
  const priorObservations = (price.priceHistory ?? []).filter((observation) => observation.recordedAt < price.recordedAt)
  if (priorObservations.length === 0) return false
  const current = effectivePrice(price)
  return priorObservations.every((observation) => current <= observation.price)
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
  isHistoricLow: boolean
}

/** Whether each active deal is actually the best price available for that product across all
 *  known stores, not just a discount off its own regular price. Per docs/05_BUSINESS_RULES.md:
 *  "A promotion is not automatically a good deal just because its percentage discount is large."
 *  A store's "-50%" deal can still be pricier than another store's everyday price. Also notes
 *  whether it's a genuine historic low where price history is actually available. */
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
      isHistoricLow: isHistoricLow(price),
    }
  })
}

export type ShoppingListItemForPricing = Pick<Item, 'name' | 'price' | 'quantity' | 'done'>

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
  /** How many of the not-done items this total is based on real per-store catalog prices for. */
  itemsPriced: number
  /** How many fell back to the item's own stored price because we have no catalog price for that product at this store. */
  itemsFallback: number
}

/** Total cost of buying every not-yet-done shopping list item in one trip, per store that has at
 *  least some catalog price data — sorted cheapest first. A product with no catalog price at a
 *  given store falls back to the item's own stored price (store-agnostic), so every candidate
 *  store still gets a comparable total instead of being silently excluded. Per
 *  docs/05_BUSINESS_RULES.md, this compares real, already-fetched prices — it never invents one. */
export function compareStoreTotals(items: ShoppingListItemForPricing[], products: ProductPrice[]): StoreTotal[] {
  const pending = items.filter((item) => !item.done)
  const stores = new Set<StoreChain>()
  for (const product of products) for (const price of product.prices) stores.add(price.store)

  return Array.from(stores)
    .map((store): StoreTotal => {
      let total = 0
      let itemsPriced = 0
      let itemsFallback = 0
      for (const item of pending) {
        const product = products.find((entry) => entry.productName === item.name)
        const priceAtStore = product?.prices.find((price) => price.store === store)
        if (priceAtStore) {
          total += effectivePrice(priceAtStore) * item.quantity
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
      const cheapest = Math.min(...product.prices.map(effectivePrice))
      return sum + cheapest * item.quantity
    }, 0)
}
