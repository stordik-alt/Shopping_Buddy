'use server'

import { eq } from 'drizzle-orm'
import { requireHousehold } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import { type DealsPage } from '@/lib/db/deals'
import * as schema from '@/lib/db/schema'
import { preferenceDealTerms } from '@/lib/preference-deals'
import { getDealsPageCached } from '@/lib/db/cached-reads'
import { isDealCategoryFilter, isDealSort, MAX_DEALS_QUERY_LENGTH, type DealCategoryFilter, type DealSort } from '@/lib/deals-browse'

// The Akce tab's paged, categorized browsing of today's promotions. Price/deal data is global (not
// household-scoped), so signing in is the only requirement — the same as the store directory's own
// actions (app/actions/store-directory.ts).

// Real chain names are short; this only stops a crafted request from sending something huge.
const MAX_CHAIN_LENGTH = 60

/** The household's preference terms (docs/16_PREFERENCE_DEALS.md), read on the server — the client only
 *  says whether it wants "Pro mě". */
async function householdDealTerms(householdId: string) {
  const row = await getDb().query.preferences.findFirst({
    where: eq(schema.preferences.householdId, householdId),
    columns: { preferredProducts: true, preferredBrands: true, excludedProducts: true },
  })
  return preferenceDealTerms(row ?? { preferredProducts: [], preferredBrands: [], excludedProducts: [] })
}

export async function dealsPageAction(input: { category: DealCategoryFilter; chain: string | null; sort: DealSort; page: number; query?: string | null; forMe?: boolean }): Promise<DealsPage> {
  const { householdId } = await requireHousehold()
  if (!isDealCategoryFilter(input.category)) throw new Error('Neplatná kategorie.')
  if (input.chain != null && (typeof input.chain !== 'string' || input.chain.length === 0 || input.chain.length > MAX_CHAIN_LENGTH)) throw new Error('Neplatný řetězec.')
  if (!isDealSort(input.sort)) throw new Error('Neplatné řazení.')
  if (!Number.isInteger(input.page) || input.page < 1) throw new Error('Neplatná stránka.')
  if (input.query != null && (typeof input.query !== 'string' || input.query.length > MAX_DEALS_QUERY_LENGTH)) throw new Error('Neplatné hledání.')
  if (input.forMe != null && typeof input.forMe !== 'boolean') throw new Error('Neplatný filtr.')
  const { preferred, excluded } = await householdDealTerms(householdId)
  return getDealsPageCached({
    category: input.category,
    chain: input.chain,
    sort: input.sort,
    page: input.page,
    query: input.query ?? null,
    preferred: input.forMe ? preferred : null,
    excluded,
  })
}
