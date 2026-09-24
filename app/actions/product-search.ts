'use server'

import { requireHousehold } from '@/lib/auth/authorize'
import { getMemberIdForUser, getMemberStoreSelection } from '@/lib/db/member-store-preferences'
import { searchProductHits } from '@/lib/db/product-search'
import { hasStoreSelection } from '@/lib/nearby-stores'
import { groupHitsByChain, searchTokens, type ProductSearchGroup } from '@/lib/product-search'
import type { ItemCategory } from '@/lib/types'

const CATEGORIES: ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']

const HITS_PER_CHAIN = 8
const MIN_QUERY_LENGTH = 2
const MAX_QUERY_LENGTH = 80

export type ProductSearchResult = {
  groups: ProductSearchGroup[]
  /** True when the results are limited to the user's own "stores in my area" (their profile). */
  nearbyOnly: boolean
  /** True when the user has chosen stores at all, so the screen can offer the nearby/all switch. */
  hasNearbySelection: boolean
}

/** Searches the chains' products by text (accent- and case-insensitive) for the signed-in user,
 *  grouped per chain. `onlyNearby` restricts it to the chains the user chose in their profile; it is
 *  ignored when they have chosen none (then every chain is searched). Requires a signed-in user;
 *  the selection comes from the session's own member, never from the request. */
export async function searchProductsAction(input: { query: string; onlyNearby: boolean; category?: ItemCategory }): Promise<ProductSearchResult> {
  const { userId } = await requireHousehold()
  if (typeof input.query !== 'string') throw new Error('Neplatné hledání.')
  const query = input.query.trim()
  if (query.length > MAX_QUERY_LENGTH) throw new Error(`Hledaný text může mít nejvýše ${MAX_QUERY_LENGTH} znaků.`)

  if (input.category != null && !CATEGORIES.includes(input.category)) throw new Error('Neplatná kategorie.')

  const memberId = await getMemberIdForUser(userId)
  const selection = memberId ? await getMemberStoreSelection(memberId) : null
  const hasNearbySelection = selection != null && hasStoreSelection(selection)
  const nearbyOnly = Boolean(input.onlyNearby) && hasNearbySelection

  // Too short to be meaningful: no results rather than every product.
  const tokens = query.length >= MIN_QUERY_LENGTH ? searchTokens(query) : []
  if (tokens.length === 0) return { groups: [], nearbyOnly, hasNearbySelection }

  const hits = await searchProductHits(tokens, { ...(nearbyOnly && selection ? { storeIds: selection.chainIds } : {}), ...(input.category ? { category: input.category } : {}) })
  return { groups: groupHitsByChain(hits, HITS_PER_CHAIN), nearbyOnly, hasNearbySelection }
}
