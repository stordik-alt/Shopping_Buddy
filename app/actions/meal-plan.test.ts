import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { TODAY } from '@/lib/budget'
import { currentWeekStart, type WeeklyMealPlan } from '@/lib/meal-plans'

// Continues the Server Action test coverage started in app/actions/shopping.test.ts.
let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({ requireHouseholdId: () => Promise.resolve(currentHouseholdId) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { saveMealPlanAction } from '@/app/actions/meal-plan'

const db = getDb()
const createdHouseholdIds: string[] = []
let householdId: string

const plan = (estimatedTotal: number): WeeklyMealPlan => ({ days: [], staples: [], estimatedTotal, recommendedStores: [] })

beforeEach(async () => {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_meal_plan__' }).returning()
  householdId = household.id
  createdHouseholdIds.push(householdId)
  currentHouseholdId = householdId
})

afterAll(async () => {
  for (const id of createdHouseholdIds) {
    await db.delete(schema.mealPlans).where(eq(schema.mealPlans.householdId, id))
    await db.delete(schema.households).where(eq(schema.households.id, id))
  }
})

describe('saveMealPlanAction', () => {
  it('creates one row for the current week on first save', async () => {
    await saveMealPlanAction(1000, plan(800))
    const rows = await db.query.mealPlans.findMany({ where: eq(schema.mealPlans.householdId, householdId) })
    expect(rows).toHaveLength(1)
    expect(rows[0].weekStart).toBe(currentWeekStart(TODAY))
    expect(Number(rows[0].estimatedTotal)).toBe(800)
  })

  it('overwrites the same week\'s row instead of creating a second one when saved again', async () => {
    await saveMealPlanAction(1000, plan(800))
    await saveMealPlanAction(1200, plan(950))
    const rows = await db.query.mealPlans.findMany({ where: eq(schema.mealPlans.householdId, householdId) })
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].budgetLimit)).toBe(1200)
    expect(Number(rows[0].estimatedTotal)).toBe(950)
  })
})
