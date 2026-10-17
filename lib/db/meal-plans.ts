import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { setMealServings, parseSavedPlan, type MealType, type WeeklyMealPlan } from '@/lib/meal-plans'

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
