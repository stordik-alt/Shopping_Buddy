import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { todayInPrague } from '@/lib/today'
import { currentWeekStart, generateWeeklyPlan, type WeeklyMealPlan } from '@/lib/meal-plans'
import type { Household } from '@/lib/types'

// Continues the Server Action test coverage started in app/actions/shopping.test.ts.
let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({ requireHouseholdId: () => Promise.resolve(currentHouseholdId) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { markMealCookedAction, saveMealPlanAction } from '@/app/actions/meal-plan'

function household(overrides: Partial<Household> = {}): Household {
  return {
    id: 'h1',
    name: 'Test Household',
    monthlyBudget: 10000,
    members: [],
    children: [],
    preferences: {
      preferredBrands: [],
      preferredStores: [],
      preferredProducts: [],
      excludedProducts: [],
      priceSensitivity: 'Vyvážené',
      qualityPreference: 'Standardní',
      preferCzechProducts: false,
    },
    restrictions: [],
    ...overrides,
  }
}

const db = getDb()
const createdHouseholdIds: string[] = []
let householdId: string

const plan = (estimatedTotal: number): WeeklyMealPlan => ({ days: [], staples: [], estimatedTotal, recommendedStores: [], cookedMeals: [] })

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
    expect(rows[0].weekStart).toBe(currentWeekStart(todayInPrague()))
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

describe('markMealCookedAction', () => {
  it('throws when the household has no saved plan for the current week', async () => {
    await expect(markMealCookedAction('Pondělí', 'Snídaně')).rejects.toThrow('No meal plan for the current week')
  })

  it('deducts each ingredient\'s real recipe quantity from the pantry (not a flat 1) and marks the meal cooked', async () => {
    const realPlan = generateWeeklyPlan(3000, household())
    await saveMealPlanAction(3000, realPlan)
    const breakfast = realPlan.days[0]
    const ingredients = breakfast.breakfast.ingredients
    for (const ingredient of ingredients) {
      await db.insert(schema.pantryItems).values({ householdId, name: ingredient.name, category: 'Potraviny', quantity: ingredient.quantity * 3, unit: ingredient.unit })
    }

    await markMealCookedAction(breakfast.day, 'Snídaně')

    for (const ingredient of ingredients) {
      const row = await db.query.pantryItems.findFirst({ where: and(eq(schema.pantryItems.householdId, householdId), eq(schema.pantryItems.name, ingredient.name)) })
      expect(Number(row?.quantity)).toBeCloseTo(ingredient.quantity * 2)
    }
    const savedRow = await db.query.mealPlans.findFirst({ where: eq(schema.mealPlans.householdId, householdId) })
    const savedPlan = JSON.parse(savedRow!.plan) as WeeklyMealPlan
    expect(savedPlan.cookedMeals).toContain(`${breakfast.day}__Snídaně`)
  })

  it('removes a pantry row entirely once its quantity reaches zero, rather than leaving a zero row', async () => {
    const realPlan = generateWeeklyPlan(3000, household())
    await saveMealPlanAction(3000, realPlan)
    const breakfast = realPlan.days[0]
    const ingredient = breakfast.breakfast.ingredients[0]
    const [pantryRow] = await db
      .insert(schema.pantryItems)
      .values({ householdId, name: ingredient.name, category: 'Potraviny', quantity: ingredient.quantity, unit: ingredient.unit })
      .returning()

    await markMealCookedAction(breakfast.day, 'Snídaně')

    expect(await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, pantryRow.id) })).toBeUndefined()
  })

  it('removes the row rather than going negative when the pantry has less than the recipe needs', async () => {
    const realPlan = generateWeeklyPlan(3000, household())
    await saveMealPlanAction(3000, realPlan)
    const breakfast = realPlan.days[0]
    const ingredient = breakfast.breakfast.ingredients[0]
    const [pantryRow] = await db
      .insert(schema.pantryItems)
      .values({ householdId, name: ingredient.name, category: 'Potraviny', quantity: ingredient.quantity / 2, unit: ingredient.unit })
      .returning()

    await markMealCookedAction(breakfast.day, 'Snídaně')

    expect(await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, pantryRow.id) })).toBeUndefined()
  })

  it('skips an ingredient whose pantry row is tracked in a unit that cannot be compared to the recipe\'s (e.g. kg vs ks), rather than guessing', async () => {
    const realPlan = generateWeeklyPlan(3000, household())
    await saveMealPlanAction(3000, realPlan)
    const breakfast = realPlan.days[0]
    // b1's "Banány" is tracked in 'ks' by the recipe itself; pick an ingredient this recipe tracks
    // in kg/g/l (mass or volume) and give it an incompatible 'ks' pantry row instead.
    const massOrVolumeIngredient = breakfast.breakfast.ingredients.find((i) => i.unit !== 'ks')!
    const [pantryRow] = await db
      .insert(schema.pantryItems)
      .values({ householdId, name: massOrVolumeIngredient.name, category: 'Potraviny', quantity: 10, unit: 'ks' })
      .returning()

    await markMealCookedAction(breakfast.day, 'Snídaně')

    const row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, pantryRow.id) })
    expect(Number(row?.quantity)).toBe(10) // untouched — units couldn't be compared, so nothing was deducted
  })

  it('never deducts below zero and skips an ingredient with no matching pantry row', async () => {
    const realPlan = generateWeeklyPlan(3000, household())
    await saveMealPlanAction(3000, realPlan)
    const breakfast = realPlan.days[0]
    await expect(markMealCookedAction(breakfast.day, 'Snídaně')).resolves.not.toThrow()
  })

  it('is idempotent — marking an already-cooked meal again does not deduct a second time', async () => {
    const realPlan = generateWeeklyPlan(3000, household())
    await saveMealPlanAction(3000, realPlan)
    const breakfast = realPlan.days[0]
    const ingredient = breakfast.breakfast.ingredients[0]
    await db.insert(schema.pantryItems).values({ householdId, name: ingredient.name, category: 'Potraviny', quantity: ingredient.quantity * 5, unit: ingredient.unit })

    await markMealCookedAction(breakfast.day, 'Snídaně')
    await markMealCookedAction(breakfast.day, 'Snídaně')

    const row = await db.query.pantryItems.findFirst({ where: and(eq(schema.pantryItems.householdId, householdId), eq(schema.pantryItems.name, ingredient.name)) })
    expect(Number(row?.quantity)).toBeCloseTo(ingredient.quantity * 4)
  })
})
