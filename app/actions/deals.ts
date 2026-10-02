'use server'

import { requireHousehold } from '@/lib/auth/authorize'
import { getDealsPage, type DealsPage } from '@/lib/db/deals'
import { isDealCategoryFilter, isDealSort, MAX_DEALS_QUERY_LENGTH, type DealCategoryFilter, type DealSort } from '@/lib/deals-browse'

// The Akce tab's paged, categorized browsing of today's promotions. Price/deal data is global (not
// household-scoped), so signing in is the only requirement — the same as the store directory's own
// actions (app/actions/store-directory.ts).

// Real chain names are short; this only stops a crafted request from sending something huge.
const MAX_CHAIN_LENGTH = 60

export async function dealsPageAction(input: { category: DealCategoryFilter; chain: string | null; sort: DealSort; page: number; query?: string | null }): Promise<DealsPage> {
  await requireHousehold()
  if (!isDealCategoryFilter(input.category)) throw new Error('Neplatná kategorie.')
  if (input.chain != null && (typeof input.chain !== 'string' || input.chain.length === 0 || input.chain.length > MAX_CHAIN_LENGTH)) throw new Error('Neplatný řetězec.')
  if (!isDealSort(input.sort)) throw new Error('Neplatné řazení.')
  if (!Number.isInteger(input.page) || input.page < 1) throw new Error('Neplatná stránka.')
  if (input.query != null && (typeof input.query !== 'string' || input.query.length > MAX_DEALS_QUERY_LENGTH)) throw new Error('Neplatné hledání.')
  return getDealsPageCached(input)
}
