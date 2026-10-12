// "Dokoupit do zásoby": the household sets a minimum and a maximum stock per PRODUCT TYPE in the Profil
// ("Máslo": 2–6 ks); when the stock of the whole type nears the minimum and a chain it prefers runs an
// interesting promotion on any product of that type, the app suggests the cheapest one and how much to
// buy (docs/36_PANTRY_STOCK_LEVELS.md). Pure — the candidate deals come from lib/db/restock.ts — so the
// rule is deterministic and testable (CLAUDE.md sections 5 and 25).
import { convertQuantity } from '@/lib/quantity-normalization'
import type { ItemUnit, PantryItem } from '@/lib/types'

/** The stock "nears" its minimum from 25 % above it: far enough ahead to catch a running promotion
 *  before the shelf is empty, not so far that every type nags. */
export const NEAR_MINIMUM_FACTOR = 1.25

/** A promotion with a known regular price must take at least this much off it to count as
 *  interesting (docs/05_BUSINESS_RULES.md: a retailer's own "-5 %" is not automatically a good deal). */
export const MIN_INTERESTING_DISCOUNT = 0.1

const round3 = (value: number) => Math.round(value * 1000) / 1000

/** The household's wanted stock of one product type, in `unit` (table household_stock_levels). */
export type StockLevel = {
  id: string
  /** lib/product-types.ts key of the type. */
  productTypeKey: string
  typeName: string
  minQuantity: number
  maxQuantity: number
  unit: ItemUnit
}

/** Why the pair is not a valid stock level, or null when it is (0 <= min < max). Used by the form and,
 *  again, by the server action. */
export function validateStockLevels(min: number | null, max: number | null): string | null {
  if (min == null || max == null) return 'Vyplňte minimum i maximum.'
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0) return 'Minimum nesmí být záporné.'
  if (max <= min) return 'Maximum musí být větší než minimum.'
  return null
}

/** One pantry row's quantity in the level's unit; null when it cannot be told (a row counted in pieces
 *  of unknown size against a level in kg). Pieces of known size count by their size (3 × 250 g butter). */
function quantityInUnit(item: PantryItem, unit: ItemUnit): number | null {
  if (item.unit === unit) return item.quantity
  // Doses count only against doses (a gel of 45 doses has no weight the app knows).
  if (item.unit === 'dávka' || unit === 'dávka') return item.quantity === 0 ? 0 : null
  const direct = convertQuantity(item.quantity, item.unit, unit)
  if (direct != null) return direct
  if (item.unit === 'ks' && item.unitQuantity != null && item.unitUnit != null && item.unitUnit !== 'dávka') return convertQuantity(item.quantity * item.unitQuantity, item.unitUnit, unit)
  return item.quantity === 0 ? 0 : null
}

/** The household's stock of the level's type: every pantry row of that type, summed in the level's
 *  unit. A row whose quantity cannot be expressed in that unit is left out rather than guessed. */
export function stockOfType(level: StockLevel, items: PantryItem[]): number {
  let total = 0
  for (const item of items) {
    if (item.productTypeKey !== level.productTypeKey) continue
    total += quantityInUnit(item, level.unit) ?? 0
  }
  return round3(total)
}

/** Whether the stock is at or below `NEAR_MINIMUM_FACTOR` × the minimum. */
export function isNearMinimum(level: Pick<StockLevel, 'minQuantity'>, stock: number): boolean {
  return stock <= level.minQuantity * NEAR_MINIMUM_FACTOR
}

/** The levels whose type is near its minimum, with the current stock. */
export function lowStockLevels(levels: StockLevel[], items: PantryItem[]): { level: StockLevel; stock: number }[] {
  return levels.map((level) => ({ level, stock: stockOfType(level, items) })).filter(({ level, stock }) => isNearMinimum(level, stock))
}

/** How much to buy to get back up to the maximum, in the level's unit — whole pieces for ks. */
export function restockQuantity(level: Pick<StockLevel, 'maxQuantity' | 'unit'>, stock: number): number {
  const missing = Math.max(0, level.maxQuantity - stock)
  return level.unit === 'ks' ? Math.ceil(round3(missing)) : round3(missing)
}

/** The identity of a refused offer: the type, the product and the day the promotion ends. */
export const dismissalKey = (productTypeKey: string, productId: string, validUntil: string) => `${productTypeKey}:${productId}:${validUntil}`

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
  levelId: string
  productTypeKey: string
  typeName: string
  /** The household's stock of the whole type when the page loaded. */
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

/** Cheapest first: by price per unit when both state one in the same unit (packs of different sizes
 *  stay comparable, CLAUDE.md section 17), otherwise by package price. Ties: chain, then product, so
 *  the order never depends on the database's row order. */
function compareCandidates(a: RestockCandidate, b: RestockCandidate): number {
  if (a.unitPrice != null && b.unitPrice != null && a.unit === b.unit && a.unitPrice !== b.unitPrice) return a.unitPrice - b.unitPrice
  if (a.unitPrice != null && b.unitPrice == null) return -1
  if (a.unitPrice == null && b.unitPrice != null) return 1
  return a.dealPrice - b.dealPrice || a.chain.localeCompare(b.chain, 'cs') || a.productName.localeCompare(b.productName, 'cs')
}

/** The types near their minimum that have an interesting running promotion on any of their products at a
 *  chain in `storeIds` (null = any chain), each with its single cheapest such promotion — the cheapest
 *  variant of the type, not the household's usual one. Most depleted first. */
export function restockSuggestions(levels: StockLevel[], items: PantryItem[], candidates: RestockCandidate[], storeIds: ReadonlySet<string> | null): RestockSuggestion[] {
  const allowed = storeIds == null ? candidates : candidates.filter((candidate) => storeIds.has(candidate.storeId))
  const suggestions: RestockSuggestion[] = []
  for (const { level, stock } of lowStockLevels(levels, items)) {
    const interesting = allowed
      .filter((candidate) => candidate.productTypeKey === level.productTypeKey)
      .filter((candidate) => {
        const discount = discountOf(candidate)
        // No regular price to compare with: shown as the offer it is, without an invented discount.
        return discount == null || discount >= MIN_INTERESTING_DISCOUNT
      })
      .sort(compareCandidates)
    const best = interesting[0]
    if (!best) continue
    suggestions.push({
      levelId: level.id,
      productTypeKey: level.productTypeKey,
      typeName: level.typeName,
      quantity: stock,
      unit: level.unit,
      minQuantity: level.minQuantity,
      maxQuantity: level.maxQuantity,
      buyQuantity: restockQuantity(level, stock),
      offer: { ...best, discount: discountOf(best) },
    })
  }
  return suggestions.sort((a, b) => a.quantity / (a.minQuantity || 1) - b.quantity / (b.minQuantity || 1) || a.typeName.localeCompare(b.typeName, 'cs'))
}
