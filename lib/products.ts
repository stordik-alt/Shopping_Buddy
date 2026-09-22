import type { ItemCategory, ItemUnit, PantryLocation } from '@/lib/types'

export type ProductCatalogEntry = {
  id: string
  name: string
  category: ItemCategory
  defaultUnit: ItemUnit
  // Where the household previously confirmed/corrected this product lives — null until a
  // human-confirmed receipt import (never an unreviewed AI guess) sets it. See
  // `lib/db/queries.ts`'s `upsertProductCatalogDefaults()`.
  defaultLocation: PantryLocation | null
}

/** Whether a free-text shopping-list item name identifies a real catalog product. Per
 *  CLAUDE.md ("do not treat product names as sufficient identifiers"), name matching is not
 *  meant to stand in for real product identity forever — this exists only to bridge the current
 *  free-text input to the real `productId` foreign key (`shoppingListItems.productId`, until now
 *  never populated) until there's a proper catalog picker. Deliberately simple: normalizes case
 *  and surrounding whitespace only, no fuzzy/typo tolerance — a match is either the same product
 *  or it isn't, never a guess. */
export function matchProductByName(catalog: ProductCatalogEntry[], name: string): ProductCatalogEntry | null {
  const normalized = name.trim().toLowerCase()
  return catalog.find((product) => product.name.trim().toLowerCase() === normalized) ?? null
}
