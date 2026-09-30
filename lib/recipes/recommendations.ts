import { matchKey } from '@/lib/receipt-list-match'
import { analyzeRecipeIngredients } from '@/lib/recipes/shopping'
import type { Recipe, RecipeSearchResult } from '@/lib/recipes/types'
import type { PantryItem } from '@/lib/types'

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

function allergyKeys(recipe: Recipe): string[] {
  return (recipe.ratingSource ? [] : recipe.allergens ?? []).map((value) => matchKey(value)).filter(Boolean)
}

export function toRecipeSearchResult(recipe: Recipe): RecipeSearchResult {
  return {
    id: recipe.id,
    sourceId: recipe.sourceId,
    sourceName: recipe.sourceName,
    sourceUrl: recipe.sourceUrl,
    canonicalUrl: recipe.canonicalUrl,
    title: recipe.title,
    description: recipe.description,
    imageUrl: recipe.imageUrl,
    servings: recipe.servings,
    servingsText: recipe.servingsText,
    totalTimeMinutes: recipe.totalTimeMinutes,
    ratingValue: recipe.ratingValue,
    ratingScale: recipe.ratingScale,
    ratingCount: recipe.ratingCount,
    ratingSource: recipe.ratingSource,
  }
}

/** Hard household rules use only structured member profile fields. Free-text child needs/preferences
 * are deliberately not converted into automatic diet exclusions. */
export function filterRecipeForHousehold(recipe: Recipe, context: RecipeHouseholdContext): boolean {
  const allergies = normalizedTerms(context.allergies)
  const dislikedFoods = normalizedTerms(context.dislikedFoods)
  const allergens = allergyKeys(recipe)

  if (allergies.some((allergy) => allergens.includes(allergy))) return false

  if (dislikedFoods.length > 0) {
    if (recipe.ingredients.some((ingredient) => dislikedFoods.some((term) => containsNormalizedTerm(ingredient.name, term)))) {
      return false
    }
  }

  return true
}

export function householdPreferenceScore(recipe: Recipe, context: RecipeHouseholdContext): number {
  const favorites = normalizedTerms(context.favoriteFoods)
  if (favorites.length === 0) return 0

  return recipe.ingredients.reduce(
    (score, ingredient) => score + (favorites.some((term) => containsNormalizedTerm(ingredient.name, term)) ? 1 : 0),
    0,
  )
}

export function rankByHouseholdPreference(recipes: Recipe[], context: RecipeHouseholdContext): RecipeSearchResult[] {
  return recipes
    .map((recipe, index) => ({ recipe, index, score: householdPreferenceScore(recipe, context) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ recipe }) => toRecipeSearchResult(recipe))
}

export function rankPantryRecommendations(
  recipes: Recipe[],
  pantryItems: PantryItem[],
  context: RecipeHouseholdContext,
): RecipePantryRecommendation[] {
  const recommendations: RecipePantryRecommendation[] = []

  for (const recipe of recipes) {
    if (recipe.ingredients.length === 0 || !filterRecipeForHousehold(recipe, context)) continue

    const analysis = analyzeRecipeIngredients(recipe.ingredients, pantryItems)
    const ingredientCount = analysis.length
    const coveredIngredientCount = analysis.filter((entry) => entry.problem === null && entry.missingQuantity === 0).length
    const matchedIngredientCount = analysis.filter((entry) => entry.problem === null && entry.stockQuantity > 0).length
    const missingIngredientCount = analysis.filter((entry) => entry.problem === null && (entry.missingQuantity ?? 0) > 0).length

    if (matchedIngredientCount === 0) continue

    recommendations.push({
      ...toRecipeSearchResult(recipe),
      coveredIngredientCount,
      ingredientCount,
      matchedIngredientCount,
      missingIngredientCount,
      householdPreferenceScore: householdPreferenceScore(recipe, context),
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
