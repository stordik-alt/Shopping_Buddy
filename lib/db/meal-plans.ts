import { and, eq, ilike } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { convertQuantity, currentWeekStart, isMealCooked, markMealCooked, parseSavedPlan, plannedRecipeIngredients, recipeFor, setMealServings, type MealType, type WeeklyMealPlan } from '@/lib/meal-plans'
import { todayInPrague } from '@/lib/today'
import { getPantryItems } from '@/lib/db/queries'
import type { PantryItem } from '@/lib/types'

export async function saveMealPlanForHousehold(
  householdId: string,
  weekStart: string,
  budgetLimit: number,
  plan: WeeklyMealPlan,
): Promise<void> {
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
}

export async function getCurrentSavedMealPlan(householdId: string): Promise<{ weekStart: string; budgetLimit: number; plan: WeeklyMealPlan } | null> {
  const db = getDb()
  const weekStart = currentWeekStart(todayInPrague())
  const row = await db.query.mealPlans.findFirst({
    where: and(eq(schema.mealPlans.householdId, householdId), eq(schema.mealPlans.weekStart, weekStart)),
  })
  if (!row) return null
  const plan = parseSavedPlan(row.plan)
  if (!plan) return null
  return { weekStart: row.weekStart, budgetLimit: Number(row.budgetLimit), plan }
}

export async function updateCurrentMealServings(
  householdId: string,
  weekStart: string,
  day: string,
  mealType: MealType,
  servings: number,
): Promise<WeeklyMealPlan | null> {
  const db = getDb()
  const existing = await db.query.mealPlans.findFirst({
    where: and(eq(schema.mealPlans.householdId, householdId), eq(schema.mealPlans.weekStart, weekStart)),
  })
  if (!existing) return null
  const saved = parseSavedPlan(existing.plan)
  if (!saved) return null
  const updated = setMealServings(saved, day, mealType, servings)
  if (!updated) return null
  await db.update(schema.mealPlans).set({ plan: JSON.stringify(updated) }).where(eq(schema.mealPlans.id, existing.id))
  return updated
}

/** Marks a saved meal as cooked for its household and deducts only comparable, measured pantry
 *  quantities. The saved-plan compare-and-set elects one request as the writer, so repeated or
 *  concurrent taps cannot deduct the same meal twice. */
export async function markCurrentMealCookedForHousehold(
  householdId: string,
  weekStart: string,
  day: string,
  mealType: MealType,
): Promise<{ pantryItems: PantryItem[]; plan: WeeklyMealPlan; changed: boolean }> {
  const db = getDb()
  const row = await db.query.mealPlans.findFirst({
    where: and(eq(schema.mealPlans.householdId, householdId), eq(schema.mealPlans.weekStart, weekStart)),
  })
  if (!row) throw new Error('No meal plan for the current week')
  const plan = parseSavedPlan(row.plan)
  if (!plan) throw new Error('The saved meal plan is outdated — regenerate it')
  if (isMealCooked(plan, day, mealType)) return { pantryItems: await getPantryItems(householdId), plan, changed: false }

  const recipe = recipeFor(plan, day, mealType)
  if (!recipe) throw new Error('Meal not found in the current plan')
  const updatedPlan = markMealCooked(plan, day, mealType)
  const claimed = await db.update(schema.mealPlans)
    .set({ plan: JSON.stringify(updatedPlan) })
    .where(and(eq(schema.mealPlans.id, row.id), eq(schema.mealPlans.plan, row.plan)))
    .returning({ id: schema.mealPlans.id })
  if (claimed.length === 0) {
    const latest = await getCurrentSavedMealPlan(householdId)
    return { pantryItems: await getPantryItems(householdId), plan: latest?.plan ?? updatedPlan, changed: false }
  }

  for (const ingredient of plannedRecipeIngredients(recipe)) {
    // Culinary and unknown measures are not safe to turn into inventory deductions.
    if (ingredient.sourceMeasure || ingredient.quantity <= 0) continue
    const pantryRow = await db.query.pantryItems.findFirst({
      where: and(eq(schema.pantryItems.householdId, householdId), ilike(schema.pantryItems.name, ingredient.name.trim())),
    })
    if (!pantryRow || pantryRow.quantity <= 0) continue
    const needed = convertQuantity(ingredient.quantity, ingredient.unit, pantryRow.unit)
    if (needed == null) continue
    const remaining = pantryRow.quantity - needed
    if (remaining <= 0) await db.delete(schema.pantryItems).where(eq(schema.pantryItems.id, pantryRow.id))
    else await db.update(schema.pantryItems).set({ quantity: remaining }).where(eq(schema.pantryItems.id, pantryRow.id))
  }
  return { pantryItems: await getPantryItems(householdId), plan: updatedPlan, changed: true }
}
