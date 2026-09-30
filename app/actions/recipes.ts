'use server'

import { auth } from '@/lib/auth/server'
import { getRecipeByUrl, searchRecipes } from '@/lib/recipes/service'

async function requireSignedIn() {
  const { data: session } = await auth.getSession()
  if (!session?.user) throw new Error('Přihlášení je vyžadováno')
}

export async function searchRecipesAction(
  query: string,
  options: { sourceId?: string; sort?: 'relevance' | 'rating' | 'time' } = {},
) {
  await requireSignedIn()
  return searchRecipes(query, options)
}

export async function getRecipeAction(sourceId: string, url: string) {
  await requireSignedIn()
  return getRecipeByUrl(sourceId, url)
}
