'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { TODAY } from '@/lib/budget'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { currentWeekStart, type WeeklyMealPlan } from '@/lib/meal-plans'

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
