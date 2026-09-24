'use server'

import { revalidatePath } from 'next/cache'
import { ForbiddenError, requireHousehold } from '@/lib/auth/authorize'
import { getMemberIdForUser, InvalidStoreSelectionError, saveMemberStoreSelection } from '@/lib/db/member-store-preferences'
import { MAX_DISTANCE_KM, normalizeDistanceKm, type StoreSelection } from '@/lib/nearby-stores'

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
}): Promise<StoreSelection> {
  const { userId } = await requireHousehold()
  const memberId = await getMemberIdForUser(userId)
  if (!memberId) throw new ForbiddenError('No household member for this account')

  if (!Array.isArray(input.chainIds) || !Array.isArray(input.locationIds)) throw new Error('Neplatný výběr obchodů.')
  if (input.chainIds.length > MAX_IDS || input.locationIds.length > MAX_IDS) throw new Error('Příliš mnoho vybraných obchodů.')
  // An invalid distance is reported, not silently turned into "not set".
  if (input.maxDistanceKm != null && normalizeDistanceKm(input.maxDistanceKm) === null) {
    throw new Error(`Vzdálenost musí být mezi 0,1 a ${MAX_DISTANCE_KM} km.`)
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
