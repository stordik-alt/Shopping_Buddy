'use server'

import { requireHousehold } from '@/lib/auth/authorize'
import { getChainTiles, searchBranches, type BranchPage, type ChainTile } from '@/lib/db/store-branch-search'
import { getStoreProductNames } from '@/lib/db/queries'
import { BRANCH_PAGE_SIZE, MAX_LOCALITY_TEXT, NEARBY_RADIUS_KM, type Locality } from '@/lib/stores/branch-search'

// The store directory: chain tiles, one page of branches at a time, and a branch's product names —
// each loaded when the user asks for it instead of with every page render (the whole directory used
// to be shipped to the browser, which used up the database's network transfer). Store data is global,
// so signing in is the only requirement; the member's own favourites come from the session, never
// from the request.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// There are well under 50 chains; the bound only stops a crafted request from sending a huge list.
const MAX_CHAINS = 50

/** What the client may say about where to look. Validated here; the radius is fixed by the server. */
export type LocalityInput = { city: string } | { lat: number; lng: number } | null

function toLocality(input: LocalityInput): Locality {
  if (input == null) return { kind: 'all' }
  if ('lat' in input) {
    const { lat, lng } = input
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new Error('Neplatná poloha.')
    }
    return { kind: 'gps', center: { lat, lng }, radiusKm: NEARBY_RADIUS_KM }
  }
  if (typeof input.city !== 'string') throw new Error('Neplatná lokalita.')
  const text = input.city.trim()
  if (text.length > MAX_LOCALITY_TEXT) throw new Error('Lokalita je příliš dlouhá.')
  // Empty text means "everywhere", not "match nothing".
  return text === '' ? { kind: 'all' } : { kind: 'city', text }
}

/** Chains with a branch in the locality, with branch counts and today's promotions. */
export async function storeChainTilesAction(locality: LocalityInput): Promise<ChainTile[]> {
  const { memberId } = await requireHousehold()
  return getChainTiles(toLocality(locality), memberId)
}

/** One page (1-based) of the branches of the chosen chains in the locality. */
export async function storeBranchesAction(input: { locality: LocalityInput; chainIds: string[]; page: number }): Promise<BranchPage> {
  const { memberId } = await requireHousehold()
  if (!Array.isArray(input.chainIds) || input.chainIds.length > MAX_CHAINS || !input.chainIds.every((id) => typeof id === 'string' && UUID.test(id))) {
    throw new Error('Neplatný výběr obchodů.')
  }
  if (!Number.isInteger(input.page) || input.page < 1) throw new Error('Neplatná stránka.')
  return searchBranches({ chainIds: input.chainIds, locality: toLocality(input.locality), memberId, page: input.page, pageSize: BRANCH_PAGE_SIZE })
}

export async function storeProductNamesAction(storeLocationId: string): Promise<string[]> {
  await requireHousehold()
  if (typeof storeLocationId !== 'string' || !UUID.test(storeLocationId)) throw new Error('Neplatná prodejna.')
  return getStoreProductNames(storeLocationId)
}
