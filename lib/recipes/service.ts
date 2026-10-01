import { eq, inArray } from 'drizzle-orm'
import { recipeDetailCache, recipeSearchCache } from '@/lib/recipes/cache'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { RECIPE_SOURCE_ADAPTERS, getRecipeSourceAdapter } from '@/lib/recipes/sources'
import type { Recipe, RecipeSearchResult } from '@/lib/recipes/types'
import { filterAndRankRecipeResults } from '@/lib/recipes/relevance'

const MAX_QUERY_LENGTH = 120
const MAX_RESULTS_PER_SOURCE = 8
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

async function getCatalogImageUrl(canonicalUrl: string): Promise<string | undefined> {
  try {
    const [row] = await getDb()
      .select({ imageUrl: schema.recipeCatalog.imageUrl, imageRef: schema.recipeCatalog.imageRef })
      .from(schema.recipeCatalog)
      .where(eq(schema.recipeCatalog.canonicalUrl, canonicalUrl))
      .limit(1)
    return row?.imageRef && row.imageUrl ? row.imageUrl : undefined
  } catch {
    return undefined
  }
}

async function enrichResult(result: RecipeSearchResult): Promise<RecipeSearchResult> {
  const catalogImageUrl = await getCatalogImageUrl(result.canonicalUrl)
  const cached = recipeDetailCache.get(result.canonicalUrl) as Recipe | undefined
  if (cached) return catalogImageUrl ? { ...cached, imageUrl: catalogImageUrl } : cached
  try {
    const recipe = await getRecipeSourceAdapter(result.sourceId).getRecipe(result.canonicalUrl)
    const enriched = catalogImageUrl ? { ...recipe, imageUrl: catalogImageUrl } : recipe
    recipeDetailCache.set(result.canonicalUrl, enriched)
    return enriched
  } catch {
    return catalogImageUrl ? { ...result, imageUrl: catalogImageUrl } : result
  }
}

async function hydrateSearchResults(results: RecipeSearchResult[]): Promise<RecipeSearchResult[]> {
  if (results.length === 0) return []
  try {
    const rows = await getDb()
      .select({
        canonicalUrl: schema.recipeCatalog.canonicalUrl,
        imageUrl: schema.recipeCatalog.imageUrl,
        imageRef: schema.recipeCatalog.imageRef,
        servings: schema.recipeCatalog.servings,
        totalTimeMinutes: schema.recipeCatalog.totalTimeMinutes,
        ratingValue: schema.recipeCatalog.ratingValue,
        ratingScale: schema.recipeCatalog.ratingScale,
        ratingCount: schema.recipeCatalog.ratingCount,
      })
      .from(schema.recipeCatalog)
      .where(inArray(schema.recipeCatalog.canonicalUrl, results.map((result) => result.canonicalUrl)))
    const byUrl = new Map(rows.map((row) => [row.canonicalUrl, row]))
    return results.map((result) => {
      const row = byUrl.get(result.canonicalUrl)
      if (!row) return result
      return {
        ...result,
        imageUrl: row.imageRef && row.imageUrl ? row.imageUrl : result.imageUrl,
        servings: row.servings != null ? Number(row.servings) : result.servings,
        totalTimeMinutes: row.totalTimeMinutes ?? result.totalTimeMinutes,
        ratingValue: row.ratingValue != null ? Number(row.ratingValue) : result.ratingValue,
        ratingScale: row.ratingScale != null ? Number(row.ratingScale) : result.ratingScale,
        ratingCount: row.ratingCount ?? result.ratingCount,
      }
    })
  } catch {
    return results
  }
}

async function searchRecipesResultsInternal(query: string, options: { sourceId?: string; sort?: 'relevance' | 'rating' | 'time' } = {}): Promise<RecipeSearchResult[]> {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return []
  const key = cacheKey(normalizedQuery, options.sourceId)
  const cached = recipeSearchCache.get(key) as RecipeSearchResult[] | undefined
  if (cached) return sortResults(cached, options.sort ?? 'relevance')

  const adapters = options.sourceId ? [getRecipeSourceAdapter(options.sourceId)] : [...RECIPE_SOURCE_ADAPTERS]
  const found = await Promise.all(adapters.map(async (adapter) => {
    try {
      const results = await adapter.search(normalizedQuery, { limit: MAX_RESULTS_PER_SOURCE })
      return results.slice(0, MAX_RESULTS_PER_SOURCE)
    } catch {
      return []
    }
  }))

  const unique = new Map<string, RecipeSearchResult>()
  for (const result of found.flat()) {
    const resultKey = result.canonicalUrl || result.sourceUrl
    if (!unique.has(resultKey)) unique.set(resultKey, result)
  }

  const hydrated = await hydrateSearchResults([...unique.values()].slice(0, MAX_RESULTS))
  const relevant = filterAndRankRecipeResults(hydrated, normalizedQuery)
  const sorted = sortResults(relevant, options.sort ?? 'relevance')
  recipeSearchCache.set(key, sorted)
  return sorted
}

async function searchRecipesDetailedInternal(query: string, options: { sourceId?: string; sort?: 'relevance' | 'rating' | 'time' } = {}): Promise<Recipe[]> {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return []
  const key = `detailed:${cacheKey(normalizedQuery, options.sourceId)}`
  const cached = recipeSearchCache.get(key) as Recipe[] | undefined
  if (cached) return sortResults(cached, options.sort ?? 'relevance') as Recipe[]
  const results = await searchRecipesResultsInternal(normalizedQuery, options)
  const enriched = await Promise.all(results.slice(0, MAX_RESULTS).map(enrichResult))
  const relevant = filterAndRankRecipeResults(enriched, normalizedQuery)
  const sorted = sortResults(relevant, options.sort ?? 'relevance') as Recipe[]
  recipeSearchCache.set(key, sorted)
  return sorted
}

export async function searchRecipes(query: string, options: { sourceId?: string; sort?: 'relevance' | 'rating' | 'time' } = {}): Promise<RecipeSearchResult[]> {
  return searchRecipesResultsInternal(query, options)
}

export async function searchRecipesDetailed(query: string, options: { sourceId?: string; sort?: 'relevance' | 'rating' | 'time' } = {}): Promise<Recipe[]> {
  return searchRecipesDetailedInternal(query, options)
}

export async function getRecipeByUrl(sourceId: string, url: string): Promise<Recipe> {
  const adapter = getRecipeSourceAdapter(sourceId)
  const parsed = new URL(url)
  if (!adapter.domains.some((domain) => parsed.protocol === 'https:' && (parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)))) {
    throw new Error('Nepovolený zdroj receptu')
  }
  const catalogImageUrl = await getCatalogImageUrl(parsed.toString())
  const cached = recipeDetailCache.get(parsed.toString()) as Recipe | undefined
  if (cached) return catalogImageUrl ? { ...cached, imageUrl: catalogImageUrl } : cached
  const recipe = await adapter.getRecipe(parsed.toString())
  const enriched = catalogImageUrl ? { ...recipe, imageUrl: catalogImageUrl } : recipe
  recipeDetailCache.set(parsed.toString(), enriched)
  return enriched
}
