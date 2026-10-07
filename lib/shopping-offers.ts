import { hitPrice, hitUnitPrice, type ProductSearchHit } from '@/lib/product-search'
import { isPlainProductVariantSuitableForRequest } from '@/lib/product-types'
import type { ItemCategory, ItemUnit } from '@/lib/types'

// From a shopping-list item to what it costs at a store: turning "2 l of milk" plus a product found at
// a chain into a price for exactly that need, and choosing which product a chain should offer when
// the user has not chosen one. Pure and deterministic (CLAUDE.md sections 5, 17 and 19) — the planner
// (lib/shopping-plan.ts) only ever sees the numbers this produces.

export type NeedSpec = {
  id: string
  name: string
  quantity: number
  unit: ItemUnit
  category: ItemCategory
}

/** The size of one retail package of a hit. Explicit/catalogued package evidence wins; otherwise
 *  weight/volume products use the price of one package divided by its unit price. The regular price
 *  pair is used when the product has one (what a package size has always been derived from); a hit the
 *  app knows only from a running offer has no regular price, so its own pair is used instead — the
 *  offer's printed unit price describes the same package, and no regular price is invented for it
 *  (CLAUDE.md sections 15 and 18). A piece-priced product without explicit package evidence defaults
 *  to one piece per package. */
export function packageSize(hit: Pick<ProductSearchHit, 'regularPrice' | 'dealPrice' | 'dealUnitPrice' | 'unitPrice' | 'unit' | 'packageSize'>): { value: number; unit: ItemUnit } | null {
  if (hit.packageSize) {
    return { value: hit.packageSize.quantity, unit: hit.packageSize.unit }
  }
  const priced = hit.regularPrice != null && hit.regularPrice > 0 && hit.unitPrice != null
    ? { price: hit.regularPrice, unitPrice: hit.unitPrice }
    : { price: hitPrice(hit), unitPrice: hitUnitPrice(hit) }
  if (hit.unit == null || hit.unit === 'ks' || priced.price == null || priced.unitPrice == null || priced.unitPrice <= 0) return null
  return { value: Math.round((priced.price / priced.unitPrice) * 1000) / 1000, unit: hit.unit }
}

/** Whether the hit is sold loose by weight or volume — priced per kilogram or litre with no retail
 *  package — in which case a piece count does not say how much of it to buy. */
function soldLoose(hit: Pick<ProductSearchHit, 'regularPrice' | 'dealPrice' | 'dealUnitPrice' | 'unitPrice' | 'packageSize'>): boolean {
  if (hit.packageSize) return false
  return hit.regularPrice != null ? hit.regularPrice === hit.unitPrice : hitPrice(hit) === hitUnitPrice(hit)
}

export type NeedCost = {
  /** What the needed quantity costs at the price a shopper pays now (promotion included). */
  cost: number
  /** How it was worked out: pro rata by unit price, or by whole packages of the product. */
  basis: 'per-unit' | 'per-package'
  /** Number of whole retail packages required to cover the need. */
  packages: number
}

const round = (value: number) => Math.round(value * 100) / 100

/** What buying `need` costs with the product in `hit`, or `null` when the two cannot be compared.
 *
 *  - A need in kilograms or grams is converted to the product's package size and rounded up to whole
 *    packages. A recipe asking for 1 g of butter therefore costs one real package, not one gram's worth
 *    of that package. Different pack sizes are still compared by unit price when choosing the product.
 *  - A need in litres or millilitres is handled the same way.
 *  - A need counted in pieces ("2 ks") buys enough whole retail packages to cover the requested pieces;
 *    an explicit "10 ks" package therefore costs one package for a 2- or 10-piece need.
 *  - A need counted in pieces against a weight- or volume-priced product sold in packages ("Hrozny
 *    500 g" at 59.80 Kč/kg) is that many packages: "1 ks" of grapes is one 500 g pack. Before
 *    2026-10-06 such products were left out, so a list item "Hrozny bezsemenné, 1 ks" was offered
 *    only the one chain that priced grapes per piece (79.90 Kč) and never Albert's 29.90 Kč pack.
 *    Goods sold loose by weight (priced per kilogram with no pack size) stay out: a piece count does
 *    not say how much of them to buy.
 *  A weight need against a piece-priced product (or a volume need against a weight-priced one) has no
 *  sound conversion and yields \`null\` — never a guess. The same holds for a hit that states no price
 *  or no unit at all (an older promotion the app keeps no unit price for): it can be put on a list, but
 *  it is left out of the plan rather than priced with an invented number. */
export function costForNeed(need: Pick<NeedSpec, 'quantity' | 'unit'>, hit: Pick<ProductSearchHit, 'regularPrice' | 'dealPrice' | 'dealUnitPrice' | 'unitPrice' | 'unit' | 'packageSize'>): NeedCost | null {
  if (!Number.isFinite(need.quantity) || need.quantity <= 0) return null
  const price = hitPrice(hit)
  if (price == null) return null
  switch (need.unit) {
    case 'ks': {
      if (hit.unit !== 'ks') {
        const size = packageSize(hit)
        // Priced per kilogram / litre at the price of one kilogram / litre: sold loose, no pack.
        if (!size || soldLoose(hit)) return null
        const packages = Math.max(1, Math.ceil(need.quantity - Number.EPSILON))
        return { cost: round(packages * price), basis: 'per-package', packages }
      }
      const size = packageSize(hit)
      const piecesPerPackage = size?.unit === 'ks' ? size.value : 1
      const packages = Math.max(1, Math.ceil((need.quantity / piecesPerPackage) - Number.EPSILON))
      return { cost: round(packages * price), basis: 'per-package', packages }
    }
    case 'kg':
    case 'g': {
      if (hit.unit !== 'kg') return null
      const kilograms = need.unit === 'g' ? need.quantity / 1000 : need.quantity
      const size = packageSize(hit)
      if (!size) return null
      const packages = Math.max(1, Math.ceil((kilograms / size.value) - Number.EPSILON))
      return { cost: round(packages * price), basis: 'per-package', packages }
    }
    case 'l':
    case 'ml': {
      if (hit.unit !== 'l') return null
      const litres = need.unit === 'ml' ? need.quantity / 1000 : need.quantity
      const size = packageSize(hit)
      if (!size) return null
      const packages = Math.max(1, Math.ceil((litres / size.value) - Number.EPSILON))
      return { cost: round(packages * price), basis: 'per-package', packages }
    }
  }
}

export type PricedHit = { hit: ProductSearchHit; cost: NeedCost }

/** The product a chain should offer for a need when the user has not chosen one: among the hits that
 *  can be priced for the need, the best text match, then the lowest cost, then the name (so the
 *  choice is stable). Only products that *are* the item count — "Polévka s vejcem" is never offered
 *  for "Vejce" (`isDirectMatch`); a chain that sells eggs only inside soups has no offer, which is
 *  honest, where a soup would be a wrong answer. `null` when nothing at that chain qualifies. */
export function pickAutoHit(need: Pick<NeedSpec, 'quantity' | 'unit'>, hits: ProductSearchHit[]): PricedHit | null {
  const priced = hits
    .filter((hit) => hit.direct)
    .map((hit) => ({ hit, cost: costForNeed(need, hit) }))
    .filter((entry): entry is PricedHit => entry.cost !== null)
  if (priced.length === 0) return null
  return priced.sort((a, b) => b.hit.score - a.hit.score || a.cost.cost - b.cost.cost || a.hit.name.localeCompare(b.hit.name, 'cs'))[0]
}

/** The product a chain should offer for a need that names a product type or group
 *  (lib/product-types.ts): every hit is already a product of an accepted type, so text scores do not
 *  matter — the cheapest one for the need wins, then the lower unit price, then the name. `null` when
 *  none of them can be priced for the need. */
export function pickTypedHit(need: Pick<NeedSpec, 'quantity' | 'unit' | 'name'>, hits: ProductSearchHit[]): PricedHit | null {
  const priced = hits
    .filter((hit) => isPlainProductVariantSuitableForRequest(need.name, hit.name))
    .map((hit) => ({ hit, cost: costForNeed(need, hit) }))
    .filter((entry): entry is PricedHit => entry.cost !== null)
  if (priced.length === 0) return null
  return priced.sort((a, b) => a.cost.cost - b.cost.cost || (a.hit.unitPrice ?? Number.POSITIVE_INFINITY) - (b.hit.unitPrice ?? Number.POSITIVE_INFINITY) || a.hit.name.localeCompare(b.hit.name, 'cs'))[0]
}
