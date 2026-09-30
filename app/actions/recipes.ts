'use server'

import { requireHouseholdId } from '@/lib/auth/authorize'
import {
  getRecipeHouseholdData,
  listRecipeFavorites,
  listRecipeHistory,
  listRecipePantryItems,
  recordRecipeView,
  toggleRecipeFavorite,
} from '@/lib/db/recipes'
import { getRecipeByUrl, searchRecipes, searchRecipesDetailed } from '@/lib/recipes/service'
import {
  filterRecipeForHousehold,
  rankByHouseholdPreference,
  rankPantryRecommendations,
  toRecipeSearchResult,
} from '@/lib/recipes/recommendations'
import { getRecipeSourceAdapter } from '@/lib/recipes/sources'
import type { Recipe } from '@/lib/recipes/types'

async function validateRecipeReference(recipe: Recipe): Promise<void> {
  const adapter = getRecipeSourceAdapter(recipe.sourceId)
  const parsed = new URL(recipe.canonicalUrl)
  const allowed = parsed.protocol === 'https:' && adapter.domains.some((domain) => parsed.hostname === domain || parsed.hostname.endsWith('.' + domain))
  if (!allowed) throw new Error('Nepovolený zdroj receptu')
}

export async function searchRecipesAction(
  query: string,
  options: { sourceId?: string; sort?: 'relevance' | 'rating' | 'time'; householdFilter?: boolean } = {},
) {
  const householdId = await requireHouseholdId()
  const sort = options.sort ?? 'relevance'

  if (!options.householdFilter) {
    return searchRecipes(query, options)
  }

  const context = await getRecipeHouseholdData(householdId)
  const detailed = await searchRecipesDetailed(query, {
    sourceId: options.sourceId,
    sort,
  })
  const filtered = detailed.filter((recipe) => filterRecipeForHousehold(recipe, context))

  if (sort === 'relevance') {
    return rankByHouseholdPreference(filtered, context)
  }

  return filtered.map(toRecipeSearchResult)
}

const MAX_PANTRY_SEARCH_TERMS = 5
const MAX_PANTRY_RECOMMENDATIONS = 12

function recommendationSearchTerms(pantryItems: Awaited<ReturnType<typeof listRecipePantryItems>>): string[] {
  const seen = new Set<string>()
  const terms: string[] = []

  for (const item of pantryItems) {
    if (item.category !== 'Potraviny' || item.tracking === 'off' || item.quantity <= 0) continue
    const key = item.name.trim().toLocaleLowerCase('cs-CZ')
    if (!key || seen.has(key)) continue
    seen.add(key)
    terms.push(item.name.trim())
    if (terms.length >= MAX_PANTRY_SEARCH_TERMS) break
  }

  return terms
}

export async function getRecipeRecommendationsAction() {
  const householdId = await requireHouseholdId()
  const [context, pantryItems] = await Promise.all([
    getRecipeHouseholdData(householdId),
    listRecipePantryItems(householdId),
  ])

  if (pantryItems.length === 0) return { recipes: [], pantryItemCount: 0 }

  const searchTerms = recommendationSearchTerms(pantryItems)
  if (searchTerms.length === 0) return { recipes: [], pantryItemCount: pantryItems.length }

  const found = await Promise.all(searchTerms.map((term) => searchRecipesDetailed(term)))
  const unique = new Map<string, Recipe>()
  for (const recipes of found) {
    for (const recipe of recipes) {
      if (!unique.has(recipe.canonicalUrl)) unique.set(recipe.canonicalUrl, recipe)
    }
  }

  const recommendations = rankPantryRecommendations([...unique.values()], pantryItems, context)
    .slice(0, MAX_PANTRY_RECOMMENDATIONS)

  return {
    recipes: recommendations,
    pantryItemCount: pantryItems.length,
  }
}

export async function getRecipeAction(sourceId: string, url: string) {
  const householdId = await requireHouseholdId()
  const recipe = await getRecipeByUrl(sourceId, url)
  await recordRecipeView(householdId, recipe)
  return recipe
}

export async function getRecipeCollectionsAction() {
  const householdId = await requireHouseholdId()
  const [favorites, history] = await Promise.all([
    listRecipeFavorites(householdId),
    listRecipeHistory(householdId),
  ])
  return { favorites, history }
}

export async function toggleRecipeFavoriteAction(recipe: Recipe): Promise<boolean> {
  const householdId = await requireHouseholdId()
  await validateRecipeReference(recipe)
  return toggleRecipeFavorite(householdId, recipe)
}
