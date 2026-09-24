'use server'

import { revalidatePath } from 'next/cache'
import { ForbiddenError, requireHousehold } from '@/lib/auth/authorize'
import { getMemberIdForUser, InvalidStoreSelectionError, saveMemberStoreSelection } from '@/lib/db/member-store-preferences'
import { MAX_DISTANCE_KM, MAX_SHOP_STORES, normalizeDistanceKm, normalizeMaxShopStores, type StoreSelection } from '@/lib/nearby-stores'

// Generous bound on what a picker can send (there are well under 100 chains and branches in total);
// only there so a crafted request cannot ask the database to look up an unbounded list.
const MAX_IDS = 500

/** Saves the signed-in user's own store preferences: the chains (and optionally branches) they have
 *  in their area, and how far they are willing to go for a shop. Personal: the member is resolved
 *  from the session, never from the request, so nobody can change another member's choices. */
export async function saveMyStorePreferencesAction(input: {
  maxDistanceKm: number | null
  chainIds: string[]
  locationIds: string[]
  /** Chains to prefer when planning a shop; must be among the chosen chains (others are dropped). */
  priorityChainIds?: string[]
  /** How many different stores the user will visit for one shop (1-6). */
  maxShopStores?: number | null
}): Promise<StoreSelection> {
  const { userId } = await requireHousehold()
  const memberId = await getMemberIdForUser(userId)
  if (!memberId) throw new ForbiddenError('No household member for this account')

  if (!Array.isArray(input.chainIds) || !Array.isArray(input.locationIds) || (input.priorityChainIds != null && !Array.isArray(input.priorityChainIds))) throw new Error('Neplatný výběr obchodů.')
  if (input.chainIds.length > MAX_IDS || input.locationIds.length > MAX_IDS || (input.priorityChainIds?.length ?? 0) > MAX_IDS) throw new Error('Příliš mnoho vybraných obchodů.')
  // An invalid distance is reported, not silently turned into "not set".
  if (input.maxDistanceKm != null && normalizeDistanceKm(input.maxDistanceKm) === null) {
    throw new Error(`Vzdálenost musí být mezi 0,1 a ${MAX_DISTANCE_KM} km.`)
  }

  if (input.maxShopStores != null && normalizeMaxShopStores(input.maxShopStores) === null) {
    throw new Error(`Počet obchodů musí být celé číslo od 1 do ${MAX_SHOP_STORES}.`)
  }

  try {
    const saved = await saveMemberStoreSelection(memberId, input)
    revalidatePath('/')
    return saved
  } catch (error) {
    if (error instanceof InvalidStoreSelectionError) throw new Error(error.message)
    throw error
  }
}
