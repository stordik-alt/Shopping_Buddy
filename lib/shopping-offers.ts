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

/** The size of one package of a hit, in its comparable unit ("1 l", "0.85 kg"): regular price ÷
 *  unit price. `null` for a piece-priced product, where one package is one piece. */
export function packageSize(hit: Pick<ProductSearchHit, 'regularPrice' | 'unitPrice' | 'unit'>): { value: number; unit: ItemUnit } | null {
  if (hit.unit === 'ks' || hit.unitPrice <= 0) return null
  return { value: Math.round((hit.regularPrice / hit.unitPrice) * 1000) / 1000, unit: hit.unit }
}

export type NeedCost = {
  /** What the needed quantity costs at the price a shopper pays now (promotion included). */
  cost: number
  /** How it was worked out: pro rata by unit price, or by whole packages of the product. */
  basis: 'per-unit' | 'per-package'
}

const round = (value: number) => Math.round(value * 100) / 100

/** What buying `need` costs with the product in `hit`, or `null` when the two cannot be compared.
 *
 *  - A need in kilograms or grams is priced pro rata by the hit's price per kilogram — fair across
 *    pack sizes (CLAUDE.md section 17: never compare package prices of different sizes).
 *  - A need in litres or millilitres likewise, by price per litre.
 *  - A need counted in pieces ("2 ks") is 2 packages of the product, at its package price. The pack
 *    sizes of different chains may then differ (see \`packageSize\`); pinning a product is how the user
 *    chooses the size they mean.
 *  A weight need against a piece-priced product (or a volume need against a weight-priced one) has no
 *  sound conversion and yields \`null\` — never a guess. */
export function costForNeed(need: Pick<NeedSpec, 'quantity' | 'unit'>, hit: Pick<ProductSearchHit, 'regularPrice' | 'dealPrice' | 'unitPrice' | 'unit'>): NeedCost | null {
  if (!Number.isFinite(need.quantity) || need.quantity <= 0) return null
  switch (need.unit) {
    case 'ks':
      return { cost: round(hitPrice(hit) * need.quantity), basis: 'per-package' }
    case 'kg':
    case 'g': {
      if (hit.unit !== 'kg') return null
      const kilograms = need.unit === 'g' ? need.quantity / 1000 : need.quantity
      return { cost: round(hitUnitPrice(hit) * kilograms), basis: 'per-unit' }
    }
    case 'l':
    case 'ml': {
      if (hit.unit !== 'l') return null
      const litres = need.unit === 'ml' ? need.quantity / 1000 : need.quantity
      return { cost: round(hitUnitPrice(hit) * litres), basis: 'per-unit' }
    }
  }
}

export type PricedHit = { hit: ProductSearchHit; cost: NeedCost }

/** The product a chain should offer for a need when the user has not chosen one: among the hits that
 *  can be priced for the need, the best text match, then the lowest cost, then the name (so the
 *  choice is stable). `null` when nothing at that chain can be priced. */
export function pickAutoHit(need: Pick<NeedSpec, 'quantity' | 'unit'>, hits: ProductSearchHit[]): PricedHit | null {
  const priced = hits
    .map((hit) => ({ hit, cost: costForNeed(need, hit) }))
    .filter((entry): entry is PricedHit => entry.cost !== null)
  if (priced.length === 0) return null
  return priced.sort((a, b) => b.hit.score - a.hit.score || a.cost.cost - b.cost.cost || a.hit.name.localeCompare(b.hit.name, 'cs'))[0]
}
