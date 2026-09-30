import type { RecipeSourceAdapter } from '@/lib/recipes/types'
import { receptyCzAdapter } from '@/lib/recipes/sources/recepty-cz'
import { apetitAdapter } from '@/lib/recipes/sources/apetit'
import { topreceptyAdapter } from '@/lib/recipes/sources/toprecepty'
import { vareniAdapter } from '@/lib/recipes/sources/vareni'

export const RECIPE_SOURCE_ADAPTERS: readonly RecipeSourceAdapter[] = [
  receptyCzAdapter,
  apetitAdapter,
  topreceptyAdapter,
  vareniAdapter,
]

export function getRecipeSourceAdapter(sourceId: string): RecipeSourceAdapter {
  const adapter = RECIPE_SOURCE_ADAPTERS.find((candidate) => candidate.id === sourceId)
  if (!adapter) throw new Error(`Unknown recipe source: ${sourceId}`)
  return adapter
}
