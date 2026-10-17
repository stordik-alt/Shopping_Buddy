import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getCurrentSavedMealPlan, saveMealPlanForHousehold } from '@/lib/db/meal-plans'
import { getHouseholdData, getPantryItems } from '@/lib/db/queries'
import { currentWeekStart, generateWeeklyPlan, ALL_MEAL_TYPES, type MealType } from '@/lib/meal-plans'
import { getMealPlanRecipePools } from '@/lib/meal-plan-recipes'
import { serializeMobileMealPlan } from '@/lib/mobile-meal-plan'
import { todayInPrague } from '@/lib/today'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const mealTypes = new Set<string>(ALL_MEAL_TYPES)

function currentDayIndex(): number {
  const day = new Date(`${todayInPrague()}T12:00:00Z`).getUTCDay()
  return (day + 6) % 7
}

async function authorizedHousehold(request: Request) {
  const user = await mobileUserFromRequest(request)
  const member = await mobileHouseholdForUser(user.id)
  return { user, member }
}

export async function GET(request: Request) {
  try {
    const { member } = await authorizedHousehold(request)
    if (!member) return json({ error: 'household_required' }, 409)
    return json({ plan: serializeMobileMealPlan(await getCurrentSavedMealPlan(member.householdId)) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile meal plan GET]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function POST(request: Request) {
  try {
    const { user, member } = await authorizedHousehold(request)
    if (!member) return json({ error: 'household_required' }, 409)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'invalid_request' }, 400)
    }
    if (!isRecord(body)) return json({ error: 'invalid_request' }, 400)

    const budgetLimit = body.budgetLimit
    const dayCount = body.dayCount
    const requestedStartDay = body.startDayIndex
    const requestedMealTypes = body.mealTypes
    const useStock = body.useStock
    if (
      typeof budgetLimit !== 'number' || !Number.isFinite(budgetLimit) || budgetLimit < 0 || budgetLimit > 99_999_999.99 ||
      typeof dayCount !== 'number' || !Number.isInteger(dayCount) || dayCount < 1 || dayCount > 7 ||
      (requestedStartDay !== undefined && (typeof requestedStartDay !== 'number' || !Number.isInteger(requestedStartDay) || requestedStartDay < 0 || requestedStartDay > 6)) ||
      !Array.isArray(requestedMealTypes) || requestedMealTypes.length === 0 ||
      !requestedMealTypes.every((mealType) => typeof mealType === 'string' && mealTypes.has(mealType)) ||
      new Set(requestedMealTypes).size !== requestedMealTypes.length ||
      typeof useStock !== 'boolean'
    ) {
      return json({ error: 'invalid_request' }, 400)
    }

    const [householdData, recipePools, pantryItems] = await Promise.all([
      getHouseholdData(user.id, user.name, user.email, user.emailVerified),
      getMealPlanRecipePools(member.householdId),
      useStock ? getPantryItems(member.householdId) : Promise.resolve(null),
    ])
    const plan = generateWeeklyPlan(
      budgetLimit,
      householdData.household,
      pantryItems,
      {
        dayCount,
        startDayIndex: requestedStartDay ?? currentDayIndex(),
        mealTypes: requestedMealTypes as MealType[],
        recipePools,
      },
    )
    const resolvedWeekStart = currentWeekStart(todayInPrague())
    await saveMealPlanForHousehold(member.householdId, resolvedWeekStart, budgetLimit, plan)
    return json({ plan: serializeMobileMealPlan({ weekStart: resolvedWeekStart, budgetLimit, plan }) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile meal plan POST]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
