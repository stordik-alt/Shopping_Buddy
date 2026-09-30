import type { Recipe, RecipeSearchResult } from '@/lib/recipes/types'

type RecipeSearchCandidate = RecipeSearchResult & Pick<Partial<Recipe>, 'ingredients'>

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('cs-CZ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokens(value: string): string[] {
  return normalize(value).split(/\s+/).filter((token) => token.length >= 2)
}

function tokenMatches(queryToken: string, textToken: string): boolean {
  return textToken === queryToken || textToken.startsWith(queryToken) || queryToken.startsWith(textToken)
}

export function recipeRelevanceScore(recipe: RecipeSearchCandidate, query: string): number {
  const queryTokens = tokens(query)
  if (queryTokens.length === 0) return 0

  const titleTokens = tokens(recipe.title)
  const descriptionTokens = tokens(recipe.description ?? '')
  const ingredientTokens = recipe.ingredients?.flatMap((ingredient) => tokens(ingredient.name)) ?? []

  let score = 0

  for (const queryToken of queryTokens) {
    if (titleTokens.some((token) => tokenMatches(queryToken, token))) score += 100
    else if (ingredientTokens.some((token) => tokenMatches(queryToken, token))) score += 60
    else if (descriptionTokens.some((token) => tokenMatches(queryToken, token))) score += 40
  }

  return score
}

export function filterAndRankRecipeResults<T extends RecipeSearchCandidate>(recipes: T[], query: string): T[] {
  return recipes
    .map((recipe, index) => ({ recipe, score: recipeRelevanceScore(recipe, query), index }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.recipe)
}
