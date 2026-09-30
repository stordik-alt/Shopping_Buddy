import { matchKey } from '@/lib/receipt-list-match'
import type { Recipe, RecipeSearchResult } from '@/lib/recipes/types'

export type RecipeHouseholdContext = {
  allergies: string[]
  dislikedFoods: string[]
  favoriteFoods: string[]
}

export type RecipePantryRecommendation = RecipeSearchResult & {
  coveredIngredientCount: number
  ingredientCount: number
  matchedIngredientCount: number
  missingIngredientCount: number
  householdPreferenceScore: number
}

function normalizedTerms(values: string[]): string[] {
  return values.map((value) => matchKey(value)).filter(Boolean)
}

function containsNormalizedTerm(text: string, term: string): boolean {
  const key = matchKey(text)
  return Boolean(key && term && (key === term || key.includes(term) || term.includes(key)))
}

function normalizedAllergens(recipe: RecipeSearchResult): string[] {
  const raw = (recipe as Recipe).allergens
  return Array.isArray(raw) ? raw.map((value) => matchKey(value)).filter(Boolean) : []
}

/** Hard household rules come only from structured member profile fields. No diet is inferred from
 * free-text child needs/preferences or from a vague household note. */
export function filterRecipeForHousehold(recipe: RecipeSearchResult, context: RecipeHouseholdContext): boolean {
  const allergies = normalizedTerms(context.allergies)
  const dislikedFoods = normalizedTerms(context.dislikedFoods)
  const allergens = normalizedAllergens(recipe)

  if (allergies.some((allergy) => allergens.includes(allergy))) return false

  const ingredients = (recipe as Recipe).ingredients
  if (Array.isArray(ingredients) && dislikedFoods.length > 0) {
    if (ingredients.some((ingredient) => dislikedFoods.some((term) => containsNormalizedTerm(ingredient.name, term)))) {
      return false
    }
  }

  return true
}

export function householdPreferenceScore(recipe: RecipeSearchResult, context: RecipeHouseholdContext): number {
  const favorites = normalizedTerms(context.favoriteFoods)
  if (favorites.length === 0) return 0

  const ingredients = (recipe as Recipe).ingredients
  if (!Array.isArray(ingredients)) return 0

  return ingredients.reduce(
    (score, ingredient) => score + (favorites.some((term) => containsNormalizedTerm(ingredient.name, term)) ? 1 : 0),
    0,
  )
}

export function rankByHouseholdPreference(
  recipes: RecipeSearchResult[],
  context: RecipeHouseholdContext,
): RecipeSearchResult[] {
  return recipes
    .map((recipe, index) => ({ recipe, index, score: householdPreferenceScore(recipe, context) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ recipe }) => recipe)
}

/** Selects recipes that make meaningful use of the pantry. An ingredient counts as covered only when
 * the same deterministic recipe-shopping analysis says the household has the full required amount.
 * Partial stock is still reported separately so the detail can show the exact missing quantity. */
export function rankPantryRecommendations(
  recipes: RecipeSearchResult[],
  pantryItems: Parameters<typeof import('@/lib/recipes/shopping').pantryStockQuantity>[0],
  analyze: typeof import('@/lib/recipes/shopping').analyzeRecipeIngredients,
): RecipePantryRecommendation[] {
  const recommendations: RecipePantryRecommendation[] = []

  for (const result of recipes) {
    const recipe = result as Recipe
    if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) continue

    const analysis = analyze(recipe.ingredients, pantryItems)
    const ingredientCount = analysis.length
    const coveredIngredientCount = analysis.filter((entry) => entry.problem === null && entry.missingQuantity === 0).length
    const matchedIngredientCount = analysis.filter((entry) => entry.problem === null && entry.stockQuantity > 0).length
    const missingIngredientCount = analysis.filter((entry) => entry.problem === null && (entry.missingQuantity ?? 0) > 0).length

    if (matchedIngredientCount === 0) continue

    recommendations.push({
      ...result,
      coveredIngredientCount,
      ingredientCount,
      matchedIngredientCount,
      missingIngredientCount,
      householdPreferenceScore: 0,
    })
  }

  return recommendations.sort(
    (a, b) =>
      b.coveredIngredientCount - a.coveredIngredientCount ||
      b.matchedIngredientCount - a.matchedIngredientCount ||
      b.householdPreferenceScore - a.householdPreferenceScore ||
      a.missingIngredientCount - b.missingIngredientCount,
  )
}

export function addHouseholdPreferenceToPantryRecommendations(
  recommendations: RecipePantryRecommendation[],
  context: RecipeHouseholdContext,
): RecipePantryRecommendation[] {
  return recommendations
    .map((recipe, index) => ({
      recipe,
      index,
      score: householdPreferenceScore(recipe, context),
    }))
    .sort((a, b) =>
      b.recipe.coveredIngredientCount - a.recipe.coveredIngredientCount ||
      b.recipe.matchedIngredientCount - a.recipe.matchedIngredientCount ||
      b.score - a.score ||
      a.recipe.missingIngredientCount - b.recipe.missingIngredientCount ||
      a.index - b.index,
    )
    .map(({ recipe, score }) => ({ ...recipe, householdPreferenceScore: score }))
}
