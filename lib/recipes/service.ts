import { recipeDetailCache, recipeSearchCache } from '@/lib/recipes/cache'
import { RECIPE_SOURCE_ADAPTERS, getRecipeSourceAdapter } from '@/lib/recipes/sources'
import type { Recipe, RecipeSearchResult } from '@/lib/recipes/types'

const MAX_QUERY_LENGTH = 120
const MAX_RESULTS_PER_SOURCE = 6
const MAX_RESULTS = 24

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH)
}

function cacheKey(query: string, sourceId?: string): string {
  return `search:${sourceId ?? 'all'}:${query.toLocaleLowerCase('cs-CZ')}`
}

function sortResults(results: RecipeSearchResult[], sort: 'relevance' | 'rating' | 'time'): RecipeSearchResult[] {
  return [...results].sort((a, b) => {
    if (sort === 'rating') {
      const ar = a.ratingValue === undefined ? -1 : (a.ratingValue / (a.ratingScale || 5)) * 5
      const br = b.ratingValue === undefined ? -1 : (b.ratingValue / (b.ratingScale || 5)) * 5
      if (br !== ar) return br - ar
      return (b.ratingCount ?? -1) - (a.ratingCount ?? -1)
    }
    if (sort === 'time') {
      const at = a.totalTimeMinutes ?? Number.POSITIVE_INFINITY
      const bt = b.totalTimeMinutes ?? Number.POSITIVE_INFINITY
      if (at !== bt) return at - bt
    }
    return 0
  })
}

async function enrichResult(result: RecipeSearchResult): Promise<RecipeSearchResult> {
  const cached = recipeDetailCache.get(result.canonicalUrl) as Recipe | undefined
  if (cached) return cached
  try {
    const recipe = await getRecipeSourceAdapter(result.sourceId).getRecipe(result.canonicalUrl)
    recipeDetailCache.set(result.canonicalUrl, recipe)
    return recipe
  } catch {
    return result
  }
}

export async function searchRecipes(
  query: string,
  options: { sourceId?: string; sort?: 'relevance' | 'rating' | 'time' } = {},
): Promise<RecipeSearchResult[]> {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return []

  const key = cacheKey(normalizedQuery, options.sourceId)
  const cached = recipeSearchCache.get(key) as RecipeSearchResult[] | undefined
  if (cached) return sortResults(cached, options.sort ?? 'relevance')

  const adapters = options.sourceId
    ? [getRecipeSourceAdapter(options.sourceId)]
    : [...RECIPE_SOURCE_ADAPTERS]

  const found = await Promise.all(
    adapters.map(async (adapter) => {
      try {
        const results = await adapter.search(normalizedQuery)
        return results.slice(0, MAX_RESULTS_PER_SOURCE)
      } catch {
        return []
      }
    }),
  )

  const unique = new Map<string, RecipeSearchResult>()
  for (const result of found.flat()) {
    const key = result.canonicalUrl || result.sourceUrl
    if (!unique.has(key)) unique.set(key, result)
  }

  const enriched = await Promise.all([...unique.values()].slice(0, MAX_RESULTS).map(enrichResult))
  recipeSearchCache.set(key, enriched)
  return sortResults(enriched, options.sort ?? 'relevance')
}

export async function getRecipeByUrl(sourceId: string, url: string): Promise<Recipe> {
  const adapter = getRecipeSourceAdapter(sourceId)
  const parsed = new URL(url)
  if (!adapter.domains.some((domain) => parsed.protocol === 'https:' && (parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)))) {
    throw new Error('Nepovolený zdroj receptu')
  }
  const cached = recipeDetailCache.get(parsed.toString()) as Recipe | undefined
  if (cached) return cached
  const recipe = await adapter.getRecipe(parsed.toString())
  recipeDetailCache.set(parsed.toString(), recipe)
  return recipe
}
