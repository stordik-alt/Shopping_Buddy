'use server'

import { requireHousehold } from '@/lib/auth/authorize'
import { getStandaloneOffersCached } from '@/lib/db/cached-reads'
import type { StandaloneOffer } from '@/lib/offers'

const MAX_NAMES = 500
const MAX_NAME_LENGTH = 300

/** Standalone offers for the current shopping list. The initial page already receives offers for
 *  its first set of items; this action refreshes that small subset after an item is added or removed,
 *  instead of making every page render carry offers for the whole catalog. */
export async function standaloneOffersForListAction(productNames: string[]): Promise<StandaloneOffer[]> {
  await requireHousehold()
  if (!Array.isArray(productNames) || productNames.length > MAX_NAMES || !productNames.every((name) => typeof name === 'string' && name.length <= MAX_NAME_LENGTH)) {
    throw new Error('Neplatný seznam produktů.')
  }
  return getStandaloneOffersCached(productNames)
}
