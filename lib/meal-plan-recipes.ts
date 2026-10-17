import { ALL_MEAL_TYPES, type MealType, type Recipe as MealPlanRecipe } from '@/lib/meal-plans'
import { getRecipeHouseholdData } from '@/lib/db/recipes'
import { getMealPlanRecipeCandidates } from '@/lib/recipes/service'
import { toRecipeShoppingItem } from '@/lib/recipes/shopping'
import { filterRecipeForHousehold } from '@/lib/recipes/recommendations'
import type { Recipe } from '@/lib/recipes/types'

const MEAL_PLAN_RECIPE_LIMIT = 36
const MEAL_PLAN_RECIPE_LIMIT_WITH_DIET = 60

function mapRecipeToMealPlanRecipe(recipe: Recipe, mealType: MealType): MealPlanRecipe {
  return {
    id: recipe.id,
    name: recipe.title,
    mealType,
    // The recipe catalog has no recipe-level price; zero means "not priced" here rather than an invented estimate.
    price: 0,
    allergens: [],
    servings: recipe.servings,
    sourceId: recipe.sourceId,
    sourceName: recipe.sourceName,
    sourceUrl: recipe.sourceUrl,
    canonicalUrl: recipe.canonicalUrl,
    imageUrl: recipe.imageUrl,
    ingredients: recipe.ingredients.map((ingredient) => {
      const shoppingItem = toRecipeShoppingItem(ingredient)
      if (shoppingItem) {
        return {
          name: shoppingItem.name,
          category: 'Potraviny',
          quantity: shoppingItem.quantity,
          unit: shoppingItem.unit,
          sourceMeasure: shoppingItem.sourceMeasure,
        }
      }
      return {
        name: ingredient.name,
        category: 'Potraviny',
        quantity: 0,
        unit: 'ks',
        sourceMeasure: ingredient.originalText || 'množství není platné',
      }
    }),
  }
}

export async function getMealPlanRecipePools(householdId: string): Promise<Partial<Record<MealType, MealPlanRecipe[]>>> {
  const context = await getRecipeHouseholdData(householdId)
  const candidateSets = await Promise.all(
    ALL_MEAL_TYPES.map(async (mealType) => {
      const candidates = await getMealPlanRecipeCandidates(
        mealType,
        context.dietStems.length > 0 ? MEAL_PLAN_RECIPE_LIMIT_WITH_DIET : MEAL_PLAN_RECIPE_LIMIT,
      )
      const safe = candidates.filter((recipe) => filterRecipeForHousehold(recipe, context))
      return [mealType, safe.map((recipe) => mapRecipeToMealPlanRecipe(recipe, mealType))] as const
    }),
  )
  return Object.fromEntries(candidateSets) as Partial<Record<MealType, MealPlanRecipe[]>>
}
