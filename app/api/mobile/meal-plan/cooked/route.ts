import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getCurrentSavedMealPlan, markCurrentMealCookedForHousehold } from '@/lib/db/meal-plans'
import { ALL_MEAL_TYPES, DAYS, currentWeekStart, type MealType } from '@/lib/meal-plans'
import { serializeMobileMealPlan } from '@/lib/mobile-meal-plan'
import { todayInPrague } from '@/lib/today'

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
    if (Object.keys(input).some((key) => !['day', 'mealType'].includes(key)) ||
      typeof input.day !== 'string' || !DAYS.includes(input.day) ||
      typeof input.mealType !== 'string' || !ALL_MEAL_TYPES.includes(input.mealType as MealType)) {
      return json({ error: 'invalid_request' }, 400)
    }
    const result = await markCurrentMealCookedForHousehold(member.householdId, currentWeekStart(todayInPrague()), input.day, input.mealType as MealType)
    const saved = await getCurrentSavedMealPlan(member.householdId)
    return json({ plan: serializeMobileMealPlan(saved), pantryItems: result.pantryItems, changed: result.changed })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof Error && error.message === 'No meal plan for the current week') return json({ error: 'not_found' }, 404)
    if (error instanceof Error && error.message === 'Meal not found in the current plan') return json({ error: 'meal_not_found' }, 404)
    if (error instanceof Error && error.message.includes('outdated')) return json({ error: 'plan_outdated' }, 409)
    console.error('[mobile meal plan cooked]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
