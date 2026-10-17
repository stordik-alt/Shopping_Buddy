import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getCurrentSavedMealPlan, updateCurrentMealServings } from '@/lib/db/meal-plans'
import { currentWeekStart, ALL_MEAL_TYPES, DAYS, MAX_MEAL_SERVINGS, type MealType } from '@/lib/meal-plans'
import { serializeMobileMealPlan } from '@/lib/mobile-meal-plan'
import { todayInPrague } from '@/lib/today'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export async function PATCH(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'invalid_request' }, 400)
    }
    if (!isRecord(body)) return json({ error: 'invalid_request' }, 400)
    const { day, mealType, servings } = body
    if (
      typeof day !== 'string' || !DAYS.includes(day) ||
      typeof mealType !== 'string' || !ALL_MEAL_TYPES.includes(mealType as MealType) ||
      typeof servings !== 'number' || !Number.isFinite(servings) || servings < 0 || servings > MAX_MEAL_SERVINGS
    ) {
      return json({ error: 'invalid_request' }, 400)
    }

    const updated = await updateCurrentMealServings(member.householdId, currentWeekStart(todayInPrague()), day, mealType as MealType, servings)
    if (!updated) return json({ error: 'not_found' }, 404)
    const saved = await getCurrentSavedMealPlan(member.householdId)
    return json({ plan: serializeMobileMealPlan(saved) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile meal plan servings]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
