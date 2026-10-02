import { hitPrice, hitUnitPrice, type ProductSearchHit } from '@/lib/product-search'
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
 *  weight/volume products use regular price ÷ unit price. A piece-priced product without explicit
 *  package evidence defaults to one piece per package. */
export function packageSize(hit: Pick<ProductSearchHit, 'regularPrice' | 'unitPrice' | 'unit' | 'packageSize'>): { value: number; unit: ItemUnit } | null {
  if (hit.packageSize) {
    return { value: hit.packageSize.quantity, unit: hit.packageSize.unit }
  }
  if (hit.unit === 'ks' || hit.unitPrice <= 0) return null
  return { value: Math.round((hit.regularPrice / hit.unitPrice) * 1000) / 1000, unit: hit.unit }
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
 *  A weight need against a piece-priced product (or a volume need against a weight-priced one) has no
 *  sound conversion and yields \`null\` — never a guess. */
export function costForNeed(need: Pick<NeedSpec, 'quantity' | 'unit'>, hit: Pick<ProductSearchHit, 'regularPrice' | 'dealPrice' | 'unitPrice' | 'unit' | 'packageSize'>): NeedCost | null {
  if (!Number.isFinite(need.quantity) || need.quantity <= 0) return null
  switch (need.unit) {
    case 'ks': {
      if (hit.unit !== 'ks') return null
      const size = packageSize(hit)
      const piecesPerPackage = size?.unit === 'ks' ? size.value : 1
      const packages = Math.max(1, Math.ceil((need.quantity / piecesPerPackage) - Number.EPSILON))
      return { cost: round(packages * hitPrice(hit)), basis: 'per-package', packages }
    }
    case 'kg':
    case 'g': {
      if (hit.unit !== 'kg') return null
      const kilograms = need.unit === 'g' ? need.quantity / 1000 : need.quantity
      const size = packageSize(hit)
      if (!size) return null
      const packages = Math.max(1, Math.ceil((kilograms / size.value) - Number.EPSILON))
      return { cost: round(packages * hitPrice(hit)), basis: 'per-package' }
    }
    case 'l':
    case 'ml': {
      if (hit.unit !== 'l') return null
      const litres = need.unit === 'ml' ? need.quantity / 1000 : need.quantity
      const size = packageSize(hit)
      if (!size) return null
      const packages = Math.max(1, Math.ceil((litres / size.value) - Number.EPSILON))
      return { cost: round(packages * hitPrice(hit)), basis: 'per-package' }
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
