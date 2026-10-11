// "Dokoupit do zásoby": the household sets a minimum and a maximum stock on a pantry row; when the
// stock nears the minimum and a chain it prefers runs an interesting promotion on that kind of goods,
// the app suggests stocking up now (docs/36_PANTRY_STOCK_LEVELS.md). Pure — the candidate deals come
// from lib/db/restock.ts — so the rule is deterministic and testable (CLAUDE.md sections 5 and 25).
import type { ItemUnit, PantryItem } from '@/lib/types'

/** The stock "nears" its minimum from 25 % above it: far enough ahead to catch a running promotion
 *  before the shelf is empty, not so far that every row nags. */
export const NEAR_MINIMUM_FACTOR = 1.25

/** A promotion with a known regular price must take at least this much off it to count as
 *  interesting (docs/05_BUSINESS_RULES.md: a retailer's own "-5 %" is not automatically a good deal). */
export const MIN_INTERESTING_DISCOUNT = 0.1

const round3 = (value: number) => Math.round(value * 1000) / 1000

/** Why the pair is not a valid stock level, or null when it is (both set with 0 <= min < max, or both
 *  empty to switch the watching off). Used by the form and, again, by the server action. */
export function validateStockLevels(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  if (min == null || max == null) return 'Vyplňte minimum i maximum, nebo obojí nechte prázdné.'
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0) return 'Minimum nesmí být záporné.'
  if (max <= min) return 'Maximum musí být větší než minimum.'
  return null
}

/** Whether the row has stock levels and its stock is at or below `NEAR_MINIMUM_FACTOR` × minimum. */
export function isNearMinimum(item: Pick<PantryItem, 'quantity' | 'minQuantity' | 'maxQuantity' | 'tracking'>): boolean {
  if (item.minQuantity == null || item.maxQuantity == null) return false
  // "Nesledovat" means the household wants no questions about the row, a suggestion included.
  if (item.tracking === 'off') return false
  return item.quantity <= item.minQuantity * NEAR_MINIMUM_FACTOR
}

/** How much to buy to get back up to the maximum, in the row's unit — whole pieces for ks. */
export function restockQuantity(item: Pick<PantryItem, 'quantity' | 'maxQuantity' | 'unit'>): number {
  const missing = Math.max(0, (item.maxQuantity ?? 0) - item.quantity)
  return item.unit === 'ks' ? Math.ceil(round3(missing)) : round3(missing)
}

/** One running promotion on a product, as lib/db/restock.ts reads it. */
export type RestockCandidate = {
  productId: string
  productName: string
  /** The product's type (lib/product-types.ts key), the link to a pantry row kept by type. */
  productTypeKey: string | null
  storeId: string
  chain: string
  /** The promotion price of one package. */
  dealPrice: number
  unit: ItemUnit | null
  /** The promotion price per `unit`; null for a deal stored before unit prices were kept. */
  unitPrice: number | null
  /** The chain's regular price of the same package; null for an offers-only chain. */
  regularPrice: number | null
  validUntil: string
}

export type RestockSuggestion = {
  itemId: string
  itemName: string
  quantity: number
  unit: ItemUnit
  minQuantity: number
  maxQuantity: number
  /** How much is missing up to the maximum (`restockQuantity`). */
  buyQuantity: number
  offer: RestockCandidate & {
    /** Fraction off the regular price (0.25 = 25 %); null when the chain has no regular price. */
    discount: number | null
  }
}

function discountOf(candidate: RestockCandidate): number | null {
  if (candidate.regularPrice == null || candidate.regularPrice <= 0) return null
  return 1 - candidate.dealPrice / candidate.regularPrice
}

function matchesItem(item: PantryItem, candidate: RestockCandidate): boolean {
  if (item.productId && candidate.productId === item.productId) return true
  return item.productTypeKey != null && candidate.productTypeKey === item.productTypeKey
}

/** Cheapest first: by price per unit when both state one in the same unit (packs of different sizes
 *  stay comparable, CLAUDE.md section 17), otherwise by package price. Ties: chain, then product, so
 *  the order never depends on the database's row order. */
function compareCandidates(a: RestockCandidate, b: RestockCandidate): number {
  if (a.unitPrice != null && b.unitPrice != null && a.unit === b.unit && a.unitPrice !== b.unitPrice) return a.unitPrice - b.unitPrice
  if (a.unitPrice != null && b.unitPrice == null) return -1
  if (a.unitPrice == null && b.unitPrice != null) return 1
  return a.dealPrice - b.dealPrice || a.chain.localeCompare(b.chain, 'cs') || a.productName.localeCompare(b.productName, 'cs')
}

/** The rows near their minimum that have an interesting running promotion at a chain in
 *  `storeIds` (null = any chain), each with its single cheapest such promotion. Most depleted first. */
export function restockSuggestions(items: PantryItem[], candidates: RestockCandidate[], storeIds: ReadonlySet<string> | null): RestockSuggestion[] {
  const allowed = storeIds == null ? candidates : candidates.filter((candidate) => storeIds.has(candidate.storeId))
  const suggestions: RestockSuggestion[] = []
  for (const item of items) {
    if (!isNearMinimum(item)) continue
    const interesting = allowed
      .filter((candidate) => matchesItem(item, candidate))
      .filter((candidate) => {
        const discount = discountOf(candidate)
        // No regular price to compare with: shown as the offer it is, without an invented discount.
        return discount == null || discount >= MIN_INTERESTING_DISCOUNT
      })
      .sort(compareCandidates)
    const best = interesting[0]
    if (!best) continue
    suggestions.push({
      itemId: item.id,
      itemName: item.name,
      quantity: item.quantity,
      unit: item.unit,
      minQuantity: item.minQuantity as number,
      maxQuantity: item.maxQuantity as number,
      buyQuantity: restockQuantity(item),
      offer: { ...best, discount: discountOf(best) },
    })
  }
  return suggestions.sort((a, b) => a.quantity / (a.minQuantity || 1) - b.quantity / (b.minQuantity || 1) || a.itemName.localeCompare(b.itemName, 'cs'))
}
