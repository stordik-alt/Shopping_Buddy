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

/** A catalog name that tells one retailer SKU apart from another product of the same name:
 *  "Tyčinka Corny Big (88-277335)". Only used on a collision (see `resolveProductForSku`), so the
 *  suffix appears rarely. Deterministic — the same SKU always gets the same name, so a repeat run
 *  finds the product it created before instead of creating another. */
export const distinctProductName = (name: string, externalId: string) => `${name.trim()} (${externalId})`

/** Which catalog product a retailer SKU that is not linked yet should attach to, and — when none —
 *  the name to create it under.
 *
 *  A name match is how a household's own "Mléko polotučné", or another retailer's product of the
 *  same name, gets this SKU's price attached instead of a duplicate. But a retailer's SKUs are
 *  distinct products by definition: if the matched product is already linked to a *different SKU of
 *  the same source*, it is a different product that merely shares a name (Penny lists several
 *  flavours of "Raw tyčinka Crip Crop"; Lidl several sizes of "Olivový olej extra panenský"), and
 *  merging them would mix their prices and promotions (CLAUDE.md section 12: a name is not an
 *  identity). It then gets its own product under a name made distinct by its SKU.
 *
 *  `linkedProductIds` are the products this source already links to. */
export function resolveProductForSku(
  catalog: ProductCatalogEntry[],
  name: string,
  externalId: string,
  linkedProductIds: ReadonlySet<string>,
): { match: ProductCatalogEntry | null; name: string } {
  const byName = matchProductByName(catalog, name)
  if (!byName || !linkedProductIds.has(byName.id)) return { match: byName, name }
  const distinct = distinctProductName(name, externalId)
  return { match: matchProductByName(catalog, distinct), name: distinct }
}
