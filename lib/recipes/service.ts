import { unstable_cache } from 'next/cache'
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { GLOBAL_CACHE_TAGS } from '@/lib/db/cache-tags'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { normalizeRecipeIngredient } from '@/lib/recipes/parser'
import type { Recipe, RecipeSearchPage, RecipeSearchResult } from '@/lib/recipes/types'

const ONE_DAY = 24 * 60 * 60

const MAX_QUERY_LENGTH = 120
const DEFAULT_PAGE_SIZE = 6
const MAX_PAGE_SIZE = 12
const MAX_DETAILED_RESULTS = 120

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH)
}

function searchTokens(query: string): string[] {
  return [...new Set(
    normalizeQuery(query)
      .toLocaleLowerCase('cs-CZ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((token) => token.length >= 2),
  )]
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

function cacheKey(query: string, sourceId?: string): string {
  return `catalog-search:${sourceId ?? 'all'}:${query.toLocaleLowerCase('cs-CZ')}`
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

function rowToSearchResult(row: typeof schema.recipeCatalog.$inferSelect): RecipeSearchResult {
  return {
    id: row.id,
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    canonicalUrl: row.canonicalUrl,
    title: row.title,
    description: row.description ?? undefined,
    imageUrl: row.imageRef && row.imageUrl ? row.imageUrl : undefined,
    servings: row.servings != null ? Number(row.servings) : undefined,
    servingsText: row.servingsText ?? undefined,
    totalTimeMinutes: row.totalTimeMinutes ?? undefined,
    ratingValue: row.ratingValue != null ? Number(row.ratingValue) : undefined,
    ratingScale: row.ratingScale != null ? Number(row.ratingScale) : undefined,
    ratingCount: row.ratingCount ?? undefined,
    ratingSource: row.ratingSource ?? undefined,
  }
}

function rowToRecipe(row: typeof schema.recipeCatalog.$inferSelect): Recipe {
  return {
    ...rowToSearchResult(row),
    prepTimeMinutes: row.prepTimeMinutes ?? undefined,
    cookTimeMinutes: row.cookTimeMinutes ?? undefined,
    category: row.category ?? undefined,
    cuisine: row.cuisine ?? undefined,
    ingredients: Array.isArray(row.ingredients)
      ? row.ingredients.map((ingredient, index) => normalizeRecipeIngredient(ingredient as Recipe['ingredients'][number], index))
      : [],
    fetchedAt: row.fetchedAt.toISOString(),
    parserVersion: row.parserVersion,
  }
}

function buildSearchWhere(query: string, sourceId?: string) {
  const tokens = searchTokens(query)
  if (tokens.length === 0) return null
  const matches = tokens.map((token) => ilike(schema.recipeCatalog.searchText, `%${escapeLike(token)}%`))
  return sourceId
    ? and(eq(schema.recipeCatalog.sourceId, sourceId), or(...matches))
    : or(...matches)
}

function buildRelevanceScore(query: string) {
  const tokens = searchTokens(query)
  if (tokens.length === 0) return sql<number>`0`
  const cases = tokens.map((token) =>
    sql<number>`CASE WHEN ${schema.recipeCatalog.title} ILIKE ${`%${escapeLike(token)}%`} THEN 100 ELSE 0 END`,
  )
  return cases.reduce((sum, value) => sql<number>`${sum} + ${value}`, sql<number>`0`)
}

async function fetchCatalogCandidates(query: string, sourceId?: string, limit = MAX_DETAILED_RESULTS): Promise<RecipeSearchResult[]> {
  const where = buildSearchWhere(query, sourceId)
  if (!where) return []

  const relevance = buildRelevanceScore(query)
  const rows = await getDb()
    .select()
    .from(schema.recipeCatalog)
    .where(where)
    .orderBy(desc(relevance), asc(schema.recipeCatalog.title))
    .limit(Math.max(1, Math.min(limit, MAX_DETAILED_RESULTS)))

  return rows.map(rowToSearchResult)
}

async function searchRecipeCatalogUncached(query: string, sourceId?: string, sort: 'relevance' | 'rating' | 'time' = 'relevance', page = 1, pageSize = DEFAULT_PAGE_SIZE): Promise<RecipeSearchPage> {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return { results: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE }
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(pageSize)))
  const where = buildSearchWhere(normalizedQuery, sourceId)
  if (!where) return { results: [], total: 0, page: safePage, pageSize: safePageSize }
  const relevance = buildRelevanceScore(normalizedQuery)
  const rowsQuery = getDb().select().from(schema.recipeCatalog).where(where).limit(safePageSize).offset((safePage - 1) * safePageSize)
  const [totalRow, rows] = await Promise.all([
    getDb().select({ count: count() }).from(schema.recipeCatalog).where(where),
    sort === 'rating'
      ? rowsQuery.orderBy(sql`CASE WHEN ${schema.recipeCatalog.ratingValue} IS NULL THEN 1 ELSE 0 END`, desc(schema.recipeCatalog.ratingValue), desc(schema.recipeCatalog.ratingCount))
      : sort === 'time'
        ? rowsQuery.orderBy(sql`CASE WHEN ${schema.recipeCatalog.totalTimeMinutes} IS NULL THEN 1 ELSE 0 END`, asc(schema.recipeCatalog.totalTimeMinutes), asc(schema.recipeCatalog.title))
        : rowsQuery.orderBy(desc(relevance), asc(schema.recipeCatalog.title)),
  ])
  return { results: rows.map(rowToSearchResult), total: Number(totalRow[0]?.count ?? 0), page: safePage, pageSize: safePageSize }
}

const searchRecipeCatalogCached = unstable_cache((query: string, sourceId: string | undefined, sort: 'relevance' | 'rating' | 'time', page: number, pageSize: number) => searchRecipeCatalogUncached(query, sourceId, sort, page, pageSize), ['recipe-search-v2'], { revalidate: ONE_DAY, tags: [GLOBAL_CACHE_TAGS.recipes] })

export async function searchRecipeCatalog(query: string, options: { sourceId?: string; sort?: 'relevance' | 'rating' | 'time'; page?: number; pageSize?: number } = {}): Promise<RecipeSearchPage> {
  return searchRecipeCatalogCached(query, options.sourceId, options.sort ?? 'relevance', Math.max(1, Math.floor(options.page ?? 1)), Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(options.pageSize ?? DEFAULT_PAGE_SIZE))))
}
export async function searchRecipes(
  query: string,
  options: { sourceId?: string; sort?: 'relevance' | 'rating' | 'time' } = {},
): Promise<RecipeSearchResult[]> {
  const page = await searchRecipeCatalog(query, { ...options, page: 1, pageSize: MAX_DETAILED_RESULTS })
  return page.results
}

async function searchRecipesDetailedUncached(query: string, sourceId?: string): Promise<Recipe[]> {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return []
  const candidates = await fetchCatalogCandidates(normalizedQuery, sourceId)
  const rows = candidates.length ? await getDb().select().from(schema.recipeCatalog).where(inArray(schema.recipeCatalog.canonicalUrl, candidates.map((item) => item.canonicalUrl))) : []
  const byUrl = new Map(rows.map((row) => [row.canonicalUrl, rowToRecipe(row)]))
  return candidates.map((item) => byUrl.get(item.canonicalUrl)).filter((item): item is Recipe => Boolean(item))
}

const searchRecipesDetailedCached = unstable_cache((query: string, sourceId: string | undefined) => searchRecipesDetailedUncached(query, sourceId), ['recipe-detailed-search-v2'], { revalidate: ONE_DAY, tags: [GLOBAL_CACHE_TAGS.recipes] })

export async function searchRecipesDetailed(query: string, options: { sourceId?: string; sort?: 'relevance' | 'rating' | 'time' } = {}): Promise<Recipe[]> {
  const recipes = await searchRecipesDetailedCached(query, options.sourceId)
  return sortResults(recipes, options.sort ?? 'relevance') as Recipe[]
}
async function getRecipeByUrlUncached(sourceId: string, url: string): Promise<Recipe> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') throw new Error('Nepovolený zdroj receptu')
  const [row] = await getDb().select().from(schema.recipeCatalog).where(and(eq(schema.recipeCatalog.sourceId, sourceId), eq(schema.recipeCatalog.canonicalUrl, parsed.toString()))).limit(1)
  if (!row) throw new Error('Recept není v katalogu')
  return rowToRecipe(row)
}

const getRecipeByUrlCached = unstable_cache((sourceId: string, url: string) => getRecipeByUrlUncached(sourceId, url), ['recipe-detail-v2'], { revalidate: ONE_DAY, tags: [GLOBAL_CACHE_TAGS.recipes] })

export async function getRecipeByUrl(sourceId: string, url: string): Promise<Recipe> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') throw new Error('Nepovolený zdroj receptu')
  return getRecipeByUrlCached(sourceId, parsed.toString())
}
const MEAL_PLAN_CATEGORY_PATTERNS: Record<string, string[]> = {
  'Snídaně': ['snídan', 'snidan', 'breakfast'],
  'Oběd': ['oběd', 'obed', 'lunch', 'hlavní chod', 'hlavni chod'],
  'Večeře': ['večeř', 'vecer', 'dinner', 'hlavní chod', 'hlavni chod'],
  'Svačina': ['svačin', 'svacin', 'snack'],
}

/** Returns detailed catalog recipes that are explicitly associated with a meal type by their
 * category/title/description. The meal planner uses these real catalog rows instead of the legacy
 * code-only recipe fixtures. */
async function getMealPlanRecipeCandidatesUncached(mealType: 'Snídaně' | 'Oběd' | 'Večeře' | 'Svačina', limit: number): Promise<Recipe[]> {
  const patterns = MEAL_PLAN_CATEGORY_PATTERNS[mealType] ?? []
  if (patterns.length === 0) return []
  const where = or(...patterns.flatMap((pattern) => [ilike(schema.recipeCatalog.category, '%' + escapeLike(pattern) + '%'), ilike(schema.recipeCatalog.title, '%' + escapeLike(pattern) + '%'), ilike(schema.recipeCatalog.description, '%' + escapeLike(pattern) + '%'), ilike(schema.recipeCatalog.searchText, '%' + escapeLike(pattern) + '%')]))
  const rows = await getDb().select().from(schema.recipeCatalog).where(where).orderBy(desc(sql`CASE WHEN ${schema.recipeCatalog.ratingValue} IS NULL THEN 1 ELSE 0 END`), desc(schema.recipeCatalog.ratingValue), asc(schema.recipeCatalog.title)).limit(Math.max(1, Math.min(limit, 60)))
  const seen = new Set<string>()
  return rows.map(rowToRecipe).filter((recipe) => { if (seen.has(recipe.canonicalUrl)) return false; seen.add(recipe.canonicalUrl); return true })
}

const getMealPlanRecipeCandidatesCached = unstable_cache((mealType: 'Snídaně' | 'Oběd' | 'Večeře' | 'Svačina', limit: number) => getMealPlanRecipeCandidatesUncached(mealType, limit), ['recipe-meal-plan-v2'], { revalidate: ONE_DAY, tags: [GLOBAL_CACHE_TAGS.recipes] })

export async function getMealPlanRecipeCandidates(mealType: 'Snídaně' | 'Oběd' | 'Večeře' | 'Svačina', limit = 36): Promise<Recipe[]> {
  return getMealPlanRecipeCandidatesCached(mealType, Math.max(1, Math.min(limit, 60)))
}