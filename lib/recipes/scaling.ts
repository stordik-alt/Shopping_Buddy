import type { Recipe, RecipeIngredient } from '@/lib/recipes/types'

export function scaleRecipeIngredients(recipe: Recipe, servings: number): RecipeIngredient[] {
  if (!Number.isFinite(servings) || servings <= 0 || recipe.servings === undefined || recipe.servings <= 0) {
    return recipe.ingredients.map((ingredient) => ({ ...ingredient }))
  }

  const factor = servings / recipe.servings
  return recipe.ingredients.map((ingredient) => {
    if (!ingredient.scalable || ingredient.quantity === undefined) return { ...ingredient }
    return { ...ingredient, quantity: ingredient.quantity * factor }
  })
}

export function formatIngredientQuantity(quantity: number): string {
  if (!Number.isFinite(quantity)) return ''
  return String(Math.round(quantity * 1000) / 1000).replace('.', ',')
}
