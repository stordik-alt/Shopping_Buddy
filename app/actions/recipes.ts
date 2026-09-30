'use server'

import { requireHouseholdId } from '@/lib/auth/authorize'
import { getRecipeByUrl, searchRecipes } from '@/lib/recipes/service'
import { getRecipeSourceAdapter } from '@/lib/recipes/sources'
import type { Recipe } from '@/lib/recipes/types'
import {
  listRecipeFavorites,
  listRecipeHistory,
  recordRecipeView,
  toggleRecipeFavorite,
} from '@/lib/db/recipes'

async function validateRecipeReference(recipe: Recipe): Promise<void> {
  const adapter = getRecipeSourceAdapter(recipe.sourceId)
  const parsed = new URL(recipe.canonicalUrl)
  const allowed = parsed.protocol === 'https:' && adapter.domains.some((domain) => parsed.hostname === domain || parsed.hostname.endsWith('.' + domain))
  if (!allowed) throw new Error('Nepovolený zdroj receptu')
}

export async function searchRecipesAction(
  query: string,
  options: { sourceId?: string; sort?: 'relevance' | 'rating' | 'time' } = {},
) {
  await requireHouseholdId()
  return searchRecipes(query, options)
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
