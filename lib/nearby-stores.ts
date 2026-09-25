import type { ProductPrice } from '@/lib/prices'

// "Which stores are in my area?" — the user's own answer, until every branch has GPS.
//
// Each household member chooses the store chains they have nearby, optionally the specific branches,
// and how far they are willing to go for a shop. Distances cannot be computed for most branches yet
// (no coordinates), so for now the *selection* decides what counts as nearby; the distance is stored
// and will apply to branches that do have coordinates once the user shares a location. The rules
// live here, free of UI and database code, so they are deterministic and testable (CLAUDE.md
// sections 5 and 19).

export type StoreSelection = {
  /** How far the user is willing to walk/travel for a shop, in km; null = not set. */
  maxDistanceKm: number | null
  /** The chosen chains (`stores.id`). */
  chainIds: string[]
  /** Specific branches the user picked, each with its chain. Optional refinement of `chainIds`. */
  branches: { storeId: string; storeLocationId: string }[]
  /** Chains the shopping planner should prefer; always a subset of `chainIds`. */
  priorityChainIds: string[]
  /** How many different stores the user is willing to visit for one shop (1-6); null = not set. */
  maxShopStores: number | null
}

/** Nothing chosen yet. */
export const EMPTY_STORE_SELECTION: StoreSelection = { maxDistanceKm: null, chainIds: [], branches: [], priorityChainIds: [], maxShopStores: null }

/** Whether the user has chosen any stores. Without a choice nothing is filtered: hiding every price
 *  of a user who simply has not configured this would be worse than showing all of them. */
export function hasStoreSelection(selection: StoreSelection): boolean {
  return selection.chainIds.length > 0
}

/** The parts of a price point that say where it applies. */
export type PriceLocation = { storeId?: string; storeLocationId?: string | null }

/** Whether a price applies to a store the user has chosen.
 *  - No selection at all: everything is nearby.
 *  - A chain that was not chosen: not nearby.
 *  - A chosen chain with no specific branches picked: every price of the chain is nearby.
 *  - A chosen chain with branches picked: a branch-specific price (e.g. from a receipt) counts only
 *    if it is one of those branches; a chain-wide price (published by the retailer for all branches)
 *    still counts, as the retailer's price applies at the picked branches too.
 *  - A price whose store cannot be identified is kept: not knowing is not a reason to hide it. */
export function isNearby(price: PriceLocation, selection: StoreSelection): boolean {
  if (!hasStoreSelection(selection)) return true
  if (!price.storeId) return true
  if (!selection.chainIds.includes(price.storeId)) return false
  const pickedInChain = selection.branches.filter((branch) => branch.storeId === price.storeId)
  if (pickedInChain.length === 0) return true
  if (!price.storeLocationId) return true
  return pickedInChain.some((branch) => branch.storeLocationId === price.storeLocationId)
}

/** The product prices restricted to the user's nearby stores. A product left with no price at any
 *  nearby store is dropped, as `getProductPrices()` already drops products with no prices at all. */
export function filterPricesToNearby(productPrices: ProductPrice[], selection: StoreSelection): ProductPrice[] {
  if (!hasStoreSelection(selection)) return productPrices
  return productPrices
    .map((product) => ({ ...product, prices: product.prices.filter((price) => isNearby(price, selection)) }))
    .filter((product) => product.prices.length > 0)
}

/** The largest distance a user can set, in km (also the database's limit). */
export const MAX_DISTANCE_KM = 50

/** What a user typed in the distance field: "1,5" or "1.5" -> 1.5; an empty field -> null (not set);
 *  anything else -> NaN (not a number, so the caller can say so instead of silently ignoring it). */
export function parseDistanceInput(text: string): number | null {
  const trimmed = text.trim().replace(',', '.')
  if (trimmed === '') return null
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN
}

/** A valid distance in km (> 0, ≤ 50, one decimal), or `null` when it is missing or invalid. */
export function normalizeDistanceKm(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0 || value > MAX_DISTANCE_KM) return null
  return Math.round(value * 10) / 10
}

/** The most stores a user can say they will visit for one shop (also the database's limit). */
export const MAX_SHOP_STORES = 6

/** A valid store count (a whole number, 1 to 6), or `null` when it is missing or invalid. */
export function normalizeMaxShopStores(value: number | null | undefined): number | null {
  if (value == null || !Number.isInteger(value) || value < 1 || value > MAX_SHOP_STORES) return null
  return value
}

/** Normalizes what a user submitted into a consistent selection: a picked branch implies its chain
 *  (so a branch can never be selected without its chain), duplicates are removed, and the distance
 *  is validated; priority stores must be among the chosen chains and the store count must be 1-6.
 *  `branchChain` maps every known branch id to its chain id; a branch it does not
 *  know is dropped. Pure — the caller still verifies the ids against the database. */
export function normalizeStoreSelection(
  input: { maxDistanceKm?: number | null; chainIds?: string[]; locationIds?: string[]; priorityChainIds?: string[]; maxShopStores?: number | null },
  branchChain: ReadonlyMap<string, string>,
): StoreSelection {
  const chainIds = new Set(input.chainIds ?? [])
  const branches = new Map<string, { storeId: string; storeLocationId: string }>()
  for (const locationId of input.locationIds ?? []) {
    const storeId = branchChain.get(locationId)
    if (!storeId) continue
    branches.set(locationId, { storeId, storeLocationId: locationId })
    chainIds.add(storeId)
  }
  // A priority store must be one of the chosen stores; anything else is dropped.
  const priorityChainIds = [...new Set(input.priorityChainIds ?? [])].filter((id) => chainIds.has(id))
  return {
    maxDistanceKm: normalizeDistanceKm(input.maxDistanceKm),
    chainIds: [...chainIds],
    branches: [...branches.values()],
    priorityChainIds,
    maxShopStores: normalizeMaxShopStores(input.maxShopStores),
  }
}

// A chain can have hundreds of branches (the OpenStreetMap import, lib/stores/osm.ts), too many to
// list in the profile at once: the list shows the picked ones and then a limited number of matches.
export const BRANCH_LIST_LIMIT = 20

const searchable = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** The branches to show in a chain's branch list: every picked one first (so a choice never
 *  disappears from view), then those whose name, address or city contains every word of `query` —
 *  ignoring case and diacritics, so "plzen" finds "Plzeň" — up to BRANCH_LIST_LIMIT in total.
 *  `total` is how many match, for "20 z 143". Pure/testable. */
export function visibleBranches<T extends { id: string; name: string; address: string; city: string }>(
  branches: T[],
  query: string,
  pickedIds: string[],
): { shown: T[]; total: number } {
  const words = searchable(query).split(/\s+/).filter(Boolean)
  const matches = (branch: T) => {
    const haystack = searchable(`${branch.name} ${branch.address} ${branch.city}`)
    return words.every((word) => haystack.includes(word))
  }
  const picked = branches.filter((branch) => pickedIds.includes(branch.id))
  const others = branches.filter((branch) => !pickedIds.includes(branch.id) && matches(branch))
  return { shown: [...picked, ...others].slice(0, Math.max(BRANCH_LIST_LIMIT, picked.length)), total: picked.length + others.length }
}
