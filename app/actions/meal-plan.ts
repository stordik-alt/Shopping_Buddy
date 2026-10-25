'use server'

import { requireHouseholdId } from '@/lib/auth/authorize'
import { todayInPrague } from '@/lib/today'
import { markCurrentMealCookedForHousehold, saveMealPlanForHousehold } from '@/lib/db/meal-plans'
import type { PantryItem } from '@/lib/types'
import {
  currentWeekStart,
  type MealType,
  type Recipe as MealPlanRecipe,
  type WeeklyMealPlan,
} from '@/lib/meal-plans'
import { getMealPlanRecipePools } from '@/lib/meal-plan-recipes'

/** Saves (or overwrites) the household's plan for the current week — one row per household per week. */
export async function saveMealPlanAction(budgetLimit: number, plan: WeeklyMealPlan) {
  const householdId = await requireHouseholdId()
  const weekStart = currentWeekStart(todayInPrague())
  await saveMealPlanForHousehold(householdId, weekStart, budgetLimit, plan)
  // No revalidatePath: the menu is already on screen (components/app-shell.tsx keeps it in its own state).
}


export async function getMealPlanRecipePoolsAction(): Promise<Partial<Record<MealType, MealPlanRecipe[]>>> {
  const householdId = await requireHouseholdId()
  return getMealPlanRecipePools(householdId)
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
  const result = await markCurrentMealCookedForHousehold(householdId, weekStart, day, mealType)
  if (!result.plan) throw new Error('No meal plan for the current week')
  return { pantryItems: result.pantryItems }
}
