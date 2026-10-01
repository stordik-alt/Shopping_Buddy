'use server'

import { and, eq, ilike } from 'drizzle-orm'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { todayInPrague } from '@/lib/today'
import { getDb } from '@/lib/db/client'
import { getPantryItems } from '@/lib/db/queries'
import * as schema from '@/lib/db/schema'
import type { PantryItem } from '@/lib/types'
import {
  ALL_MEAL_TYPES,
  convertQuantity,
  currentWeekStart,
  isMealCooked,
  markMealCooked,
  parseSavedPlan,
  recipeFor,
  type MealType,
  type Recipe as MealPlanRecipe,
  type WeeklyMealPlan,
} from '@/lib/meal-plans'
import { getMealPlanRecipeCandidates } from '@/lib/recipes/service'
import { toRecipeShoppingItem } from '@/lib/recipes/shopping'
import { filterRecipeForHousehold } from '@/lib/recipes/recommendations'
import { getRecipeHouseholdData } from '@/lib/db/recipes'
import type { Recipe } from '@/lib/recipes/types'

/** Saves (or overwrites) the household's plan for the current week — one row per household per week. */
export async function saveMealPlanAction(budgetLimit: number, plan: WeeklyMealPlan) {
  const householdId = await requireHouseholdId()
  const weekStart = currentWeekStart(todayInPrague())
  const db = getDb()

  const existing = await db.query.mealPlans.findFirst({
    where: and(eq(schema.mealPlans.householdId, householdId), eq(schema.mealPlans.weekStart, weekStart)),
  })
  const values = { budgetLimit: budgetLimit.toString(), estimatedTotal: plan.estimatedTotal.toString(), plan: JSON.stringify(plan) }

  if (existing) {
    await db.update(schema.mealPlans).set(values).where(eq(schema.mealPlans.id, existing.id))
  } else {
    await db.insert(schema.mealPlans).values({ householdId, weekStart, ...values })
  }
  // No revalidatePath: the menu is already on screen (components/app-shell.tsx keeps it in its own state).
}


const MEAL_PLAN_RECIPE_LIMIT = 36

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
      // Keep malformed source data visible in the recipe snapshot, but do not turn it into a
      // purchasable quantity. The normal recipe-shopping validator will continue to reject it.
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

export async function getMealPlanRecipePoolsAction(): Promise<Partial<Record<MealType, MealPlanRecipe[]>>> {
  const householdId = await requireHouseholdId()
  const context = await getRecipeHouseholdData(householdId)

  const candidateSets = await Promise.all(
    ALL_MEAL_TYPES.map(async (mealType) => {
      const candidates = await getMealPlanRecipeCandidates(mealType, MEAL_PLAN_RECIPE_LIMIT)
      const safe = candidates.filter((recipe) => filterRecipeForHousehold(recipe, context))
      return [mealType, safe.map((recipe) => mapRecipeToMealPlanRecipe(recipe, mealType))] as const
    }),
  )

  return Object.fromEntries(candidateSets) as Partial<Record<MealType, MealPlanRecipe[]>>
}

/** Marks a meal from the current week's saved plan as actually cooked and deducts its recipe's
 *  ingredients from the pantry — one unit per ingredient, matched by name, wherever it's tracked
 *  (spíž/lednice/mrazák). Idempotent: calling it again for an already-cooked meal does nothing, so
 *  a duplicate click (or request) can never double-deduct. Never deducts below zero — an
 *  ingredient with no matching pantry row, or already at zero, is simply skipped rather than
 *  invented or driven negative. One-directional: there is no "unmark" that restores the deduction.
 *  Returns the pantry as it is afterwards, so the page can show the deduction without a full refresh. */
export async function markMealCookedAction(day: string, mealType: MealType): Promise<{ pantryItems: PantryItem[] }> {
  const householdId = await requireHouseholdId()
  const weekStart = currentWeekStart(todayInPrague())
  const db = getDb()

  const row = await db.query.mealPlans.findFirst({ where: and(eq(schema.mealPlans.householdId, householdId), eq(schema.mealPlans.weekStart, weekStart)) })
  if (!row) throw new Error('No meal plan for the current week')

  const plan = parseSavedPlan(row.plan)
  if (!plan) throw new Error('The saved meal plan is outdated — regenerate it')
  if (isMealCooked(plan, day, mealType)) return { pantryItems: await getPantryItems(householdId) }

  const recipe = recipeFor(plan, day, mealType)
  if (!recipe) throw new Error('Meal not found in the current plan')

  for (const ingredient of recipe.ingredients) {
    const pantryRow = await db.query.pantryItems.findFirst({
      where: and(eq(schema.pantryItems.householdId, householdId), ilike(schema.pantryItems.name, ingredient.name.trim())),
    })
    if (!pantryRow || pantryRow.quantity <= 0) continue
    // Convert the recipe's real quantity/unit into whatever unit this pantry row happens to track
    // the ingredient in — null means they can't be compared (e.g. recipe needs kg, pantry counts
    // ks), in which case skip rather than guess at how much to deduct.
    const needed = convertQuantity(ingredient.quantity, ingredient.unit, pantryRow.unit)
    if (needed == null) continue
    const remaining = pantryRow.quantity - needed
    if (remaining <= 0) {
      await db.delete(schema.pantryItems).where(eq(schema.pantryItems.id, pantryRow.id))
    } else {
      await db.update(schema.pantryItems).set({ quantity: remaining }).where(eq(schema.pantryItems.id, pantryRow.id))
    }
  }

  const updatedPlan = markMealCooked(plan, day, mealType)
  await db.update(schema.mealPlans).set({ plan: JSON.stringify(updatedPlan) }).where(eq(schema.mealPlans.id, row.id))
  return { pantryItems: await getPantryItems(householdId) }
}
