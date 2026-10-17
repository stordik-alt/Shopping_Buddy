import { ALL_MEAL_TYPES, isMealCooked, plannedRecipeIngredients, recipeFor, type WeeklyMealPlan } from '@/lib/meal-plans'

export function serializeMobileMealPlan(saved: { weekStart: string; budgetLimit: number; plan: WeeklyMealPlan } | null) {
  if (!saved) return null
  return {
    weekStart: saved.weekStart,
    budgetLimit: saved.budgetLimit,
    estimatedTotal: saved.plan.estimatedTotal,
    pricingPending: saved.plan.pricingPending ?? false,
    recommendedStores: saved.plan.recommendedStores,
    days: saved.plan.days.map((day) => ({
      day: day.day,
      meals: ALL_MEAL_TYPES.flatMap((mealType) => {
        const recipe = recipeFor(saved.plan, day.day, mealType)
        if (!recipe) return []
        return [{
          mealType,
          cooked: isMealCooked(saved.plan, day.day, mealType),
          recipe: {
            id: recipe.id,
            name: recipe.name,
            sourceName: recipe.sourceName ?? null,
            imageUrl: recipe.imageUrl ?? null,
            sourceUrl: recipe.sourceUrl ?? null,
            servings: recipe.servings ?? null,
            selectedServings: recipe.selectedServings ?? recipe.servings ?? 1,
            ingredients: plannedRecipeIngredients(recipe).map(({ name, quantity, unit, sourceMeasure }) => ({
              name,
              quantity,
              unit,
              sourceMeasure: sourceMeasure ?? null,
            })),
          },
        }]
      }),
    })),
  }
}
