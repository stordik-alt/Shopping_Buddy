import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { searchRecipeCatalog } from '@/lib/recipes/service'
import { RECIPE_SOURCE_ADAPTERS } from '@/lib/recipes/sources'
import { getRecipeHouseholdData } from '@/lib/db/recipes'
import { searchRecipesDetailed } from '@/lib/recipes/service'
import { filterRecipeForHousehold, rankByHouseholdPreference, toRecipeSearchResult } from '@/lib/recipes/recommendations'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const MAX_QUERY_LENGTH = 120
const MAX_PAGE_SIZE = 12

function parsePositiveInteger(value: string | null, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number | null {
  if (value === null) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : null
}

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)

    const params = new URL(request.url).searchParams
    const query = params.get('q')?.trim() ?? ''
    const sourceId = params.get('sourceId') || undefined
    const requestedSort = params.get('sort') ?? 'relevance'
    const householdFilter = params.get('householdFilter') === 'true'
    const sortOptions = ['relevance', 'rating', 'time'] as const
    const page = parsePositiveInteger(params.get('page'), 1)
    const pageSize = parsePositiveInteger(params.get('pageSize'), 6, MAX_PAGE_SIZE)
    if (
      query.length > MAX_QUERY_LENGTH ||
      (sourceId !== undefined && !RECIPE_SOURCE_ADAPTERS.some((source) => source.id === sourceId)) ||
      !sortOptions.includes(requestedSort as (typeof sortOptions)[number]) ||
      page === null ||
      pageSize === null
    ) {
      return json({ error: 'invalid_request' }, 400)
    }

    let results
    if (householdFilter) {
      const context = await getRecipeHouseholdData(member.householdId)
      const detailed = await searchRecipesDetailed(query, { sourceId, sort: requestedSort as (typeof sortOptions)[number] })
      const filtered = detailed.filter((recipe) => filterRecipeForHousehold(recipe, context))
      const ranked = requestedSort === 'relevance' ? rankByHouseholdPreference(filtered, context) : filtered.map(toRecipeSearchResult)
      results = { results: ranked.slice((page - 1) * pageSize, page * pageSize), total: ranked.length, page, pageSize }
    } else {
      results = await searchRecipeCatalog(query, { sourceId, sort: requestedSort as (typeof sortOptions)[number], page, pageSize })
    }
    const origin = new URL(request.url)
    return json({
      ...results,
      results: results.results.map((recipe) => ({
        ...recipe,
        imageUrl: recipe.imageUrl
          ? new URL(`/api/recipes/images/${encodeURIComponent(recipe.id)}`, origin).toString()
          : undefined,
      })),
    })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile recipes]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
