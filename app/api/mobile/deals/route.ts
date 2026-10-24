import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { DEALS_PAGE_SIZE, isDealCategoryFilter, isDealSort, MAX_DEALS_QUERY_LENGTH, type DealCategoryFilter, type DealSort } from '@/lib/deals-browse'
import { getDealsPageCached } from '@/lib/db/cached-reads'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { preferenceDealTerms } from '@/lib/preference-deals'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)

    const params = new URL(request.url).searchParams
    const rawCategory = params.get('category') ?? 'all'
    const rawSort = params.get('sort') ?? 'name'
    const rawPage = Number(params.get('page') ?? '1')
    const rawChain = params.get('chain')
    const query = params.get('query')?.trim() ?? ''
    const forMe = params.get('forMe') === 'true'
    if (!isDealCategoryFilter(rawCategory) || !isDealSort(rawSort)) return json({ error: 'invalid_filter' }, 400)
    if (!Number.isInteger(rawPage) || rawPage < 1) return json({ error: 'invalid_page' }, 400)
    if (rawChain != null && (rawChain.length === 0 || rawChain.length > 60)) return json({ error: 'invalid_chain' }, 400)
    if (query.length > MAX_DEALS_QUERY_LENGTH) return json({ error: 'invalid_query' }, 400)

    const preference = await getDb().query.preferences.findFirst({
      where: eq(schema.preferences.householdId, member.householdId),
      columns: { preferredProducts: true, preferredBrands: true, excludedProducts: true },
    })
    const terms = preferenceDealTerms(preference ?? { preferredProducts: [], preferredBrands: [], excludedProducts: [] })
    const result = await getDealsPageCached({
      category: rawCategory as DealCategoryFilter,
      chain: rawChain,
      sort: rawSort as DealSort,
      page: rawPage,
      query: query || null,
      preferred: forMe ? terms.preferred : null,
      excluded: terms.excluded,
    })
    return json({ ...result, pageSize: DEALS_PAGE_SIZE, hasPreferences: terms.preferred.length > 0 })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile deals]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
