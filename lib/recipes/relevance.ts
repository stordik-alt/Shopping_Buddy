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
  if (textToken === queryToken || textToken.startsWith(queryToken) || queryToken.startsWith(textToken)) return true

  // Czech inflections/derivations often change the ending rather than keeping
  // the complete query token as a prefix (e.g. "zelenina" -> "zeleninový",
  // "rýže" -> "rýžový"). Treat a stable three-character stem as a match for
  // meaningful query tokens.
  if (queryToken.length >= 4 && textToken.length >= 4) {
    let commonPrefix = 0
    while (commonPrefix < queryToken.length && commonPrefix < textToken.length && queryToken[commonPrefix] === textToken[commonPrefix]) {
      commonPrefix += 1
    }
    return commonPrefix >= 3
  }

  return false
}

/**
 * Prevent portal search pages that return a generic catalogue from feeding
 * unrelated recipes into the importer candidate set.
 *
 * Czech prefix matching is intentional: "kuře" must match "kuřecí".
 * For multi-word queries, all terms are preferred; otherwise a meaningful
 * (>= 4 characters) matching term is sufficient for the candidate gate.
 */
export function isRecipeTitleRelevant(title: string, query: string): boolean {
  const queryTokens = tokens(query)
  const titleTokens = tokens(title)
  if (queryTokens.length === 0 || titleTokens.length === 0) return false

  const matches = queryTokens.map((queryToken) =>
    titleTokens.some((titleToken) => tokenMatches(queryToken, titleToken)),
  )

  return matches.every(Boolean) || queryTokens.some((queryToken, index) => queryToken.length >= 4 && matches[index])
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
