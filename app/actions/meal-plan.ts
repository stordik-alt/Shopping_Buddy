'use server'

import { and, eq, ilike } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { TODAY } from '@/lib/budget'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { convertQuantity, currentWeekStart, isMealCooked, markMealCooked, recipeFor, type MealType, type WeeklyMealPlan } from '@/lib/meal-plans'

/** Saves (or overwrites) the household's plan for the current week — one row per household per week. */
export async function saveMealPlanAction(budgetLimit: number, plan: WeeklyMealPlan) {
  const householdId = await requireHouseholdId()
  const weekStart = currentWeekStart(TODAY)
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
  revalidatePath('/')
}

/** Marks a meal from the current week's saved plan as actually cooked and deducts its recipe's
 *  ingredients from the pantry — one unit per ingredient, matched by name, wherever it's tracked
 *  (spíž/lednice/mrazák). Idempotent: calling it again for an already-cooked meal does nothing, so
 *  a duplicate click (or request) can never double-deduct. Never deducts below zero — an
 *  ingredient with no matching pantry row, or already at zero, is simply skipped rather than
 *  invented or driven negative. One-directional: there is no "unmark" that restores the deduction. */
export async function markMealCookedAction(day: string, mealType: MealType) {
  const householdId = await requireHouseholdId()
  const weekStart = currentWeekStart(TODAY)
  const db = getDb()

  const row = await db.query.mealPlans.findFirst({ where: and(eq(schema.mealPlans.householdId, householdId), eq(schema.mealPlans.weekStart, weekStart)) })
  if (!row) throw new Error('No meal plan for the current week')

  const parsed = JSON.parse(row.plan) as WeeklyMealPlan
  const plan: WeeklyMealPlan = { ...parsed, cookedMeals: parsed.cookedMeals ?? [] }
  if (isMealCooked(plan, day, mealType)) return

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
  revalidatePath('/')
}
