import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getCurrentSavedMealPlan, saveMealPlanForHousehold } from '@/lib/db/meal-plans'
import { getHouseholdData, getPantryItems } from '@/lib/db/queries'
import { ALL_MEAL_TYPES, DAYS, recipeFor, regenerateMeal, type MealType } from '@/lib/meal-plans'
import { getMealPlanRecipePools } from '@/lib/meal-plan-recipes'
import { serializeMobileMealPlan } from '@/lib/mobile-meal-plan'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)

    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_request' }, 400)
    const input = body as Record<string, unknown>
    if (Object.keys(input).some((key) => !['day', 'mealType', 'useStock'].includes(key)) ||
      typeof input.day !== 'string' || !DAYS.includes(input.day) ||
      typeof input.mealType !== 'string' || !ALL_MEAL_TYPES.includes(input.mealType as MealType) ||
      typeof input.useStock !== 'boolean') {
      return json({ error: 'invalid_request' }, 400)
    }

    const saved = await getCurrentSavedMealPlan(member.householdId)
    if (!saved) return json({ error: 'not_found' }, 404)
    const mealType = input.mealType as MealType
    const [householdData, recipePools, pantryItems] = await Promise.all([
      getHouseholdData(user.id, user.name, user.email, user.emailVerified),
      getMealPlanRecipePools(member.householdId),
      input.useStock ? getPantryItems(member.householdId) : Promise.resolve(null),
    ])
    const nextPlan = regenerateMeal(saved.plan, input.day, mealType, householdData.household, pantryItems, recipePools)
    const previousRecipe = recipeFor(saved.plan, input.day, mealType)
    const nextRecipe = recipeFor(nextPlan, input.day, mealType)
    if (!previousRecipe || !nextRecipe) return json({ error: 'meal_not_found' }, 404)
    if (previousRecipe.id === nextRecipe.id) return json({ error: 'no_alternative' }, 409)

    await saveMealPlanForHousehold(member.householdId, saved.weekStart, saved.budgetLimit, nextPlan)
    return json({ plan: serializeMobileMealPlan({ ...saved, plan: nextPlan }) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile meal plan regenerate]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
