import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const getCurrentSavedMealPlan = vi.fn()
const saveMealPlanForHousehold = vi.fn()
const updateCurrentMealServings = vi.fn()
const getHouseholdData = vi.fn()
const getPantryItems = vi.fn()
const getMealPlanRecipePools = vi.fn()
const generateWeeklyPlan = vi.fn()

vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/meal-plans', () => ({
  getCurrentSavedMealPlan: (...args: unknown[]) => getCurrentSavedMealPlan(...args),
  saveMealPlanForHousehold: (...args: unknown[]) => saveMealPlanForHousehold(...args),
  updateCurrentMealServings: (...args: unknown[]) => updateCurrentMealServings(...args),
}))
vi.mock('@/lib/db/queries', async (original) => ({
  ...(await original<typeof import('@/lib/db/queries')>()),
  getHouseholdData: (...args: unknown[]) => getHouseholdData(...args),
  getPantryItems: (...args: unknown[]) => getPantryItems(...args),
}))
vi.mock('@/lib/meal-plan-recipes', () => ({
  getMealPlanRecipePools: (...args: unknown[]) => getMealPlanRecipePools(...args),
}))
vi.mock('@/lib/meal-plans', async (original) => ({
  ...(await original<typeof import('@/lib/meal-plans')>()),
  generateWeeklyPlan: (...args: unknown[]) => generateWeeklyPlan(...args),
}))

import { GET, POST } from '@/app/api/mobile/meal-plan/route'
import { PATCH } from '@/app/api/mobile/meal-plan/servings/route'
import { MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { MAX_MEAL_SERVINGS, type WeeklyMealPlan } from '@/lib/meal-plans'

const plan: WeeklyMealPlan = {
  days: [{
    day: 'Pondělí',
    lunch: {
      id: 'recipe-1',
      name: 'Polévka',
      mealType: 'Oběd',
      price: 0,
      allergens: [],
      servings: 2,
      selectedServings: 2,
      sourceName: 'Katalog',
      ingredients: [{ name: 'Mrkev', category: 'Potraviny', quantity: 2, unit: 'ks' }],
    },
  }],
  staples: [],
  estimatedTotal: 0,
  recommendedStores: ['Lidl'],
  cookedMeals: [],
}
const saved = { weekStart: '2026-10-12', budgetLimit: 500, plan }
const request = (path: string, method = 'GET', body?: unknown) => new Request(`https://anitka.example${path}`, {
  method,
  headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

describe('/api/mobile/meal-plan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1', name: 'Test', email: 'test@example.cz', emailVerified: true })
    mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1', role: 'member' })
    getCurrentSavedMealPlan.mockResolvedValue(saved)
    saveMealPlanForHousehold.mockResolvedValue(undefined)
    updateCurrentMealServings.mockResolvedValue(plan)
    getHouseholdData.mockResolvedValue({ household: {} })
    getPantryItems.mockResolvedValue([])
    getMealPlanRecipePools.mockResolvedValue({})
    generateWeeklyPlan.mockReturnValue(plan)
  })

  it('reads a validated saved plan only for the verified household', async () => {
    const response = await GET(request('/api/mobile/meal-plan'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(getCurrentSavedMealPlan).toHaveBeenCalledWith('household-1')
    const body = await response.json()
    expect(body.plan.days[0].meals[0]).toMatchObject({
      mealType: 'Oběd',
      recipe: { id: 'recipe-1', selectedServings: 2, ingredients: [{ name: 'Mrkev', quantity: 2, unit: 'ks' }] },
    })
  })

  it('rejects missing membership and invalid bearer authentication', async () => {
    mobileHouseholdForUser.mockResolvedValueOnce(null)
    expect((await GET(request('/api/mobile/meal-plan'))).status).toBe(409)
    mobileUserFromRequest.mockRejectedValueOnce(new MobileRequestAuthError('not_signed_in', 401))
    expect((await GET(request('/api/mobile/meal-plan'))).status).toBe(401)
    expect(getCurrentSavedMealPlan).not.toHaveBeenCalled()
  })

  it('generates server-side from approved recipe pools and stores no client-supplied plan', async () => {
    const response = await POST(request('/api/mobile/meal-plan', 'POST', {
      budgetLimit: 500,
      dayCount: 2,
      mealTypes: ['Oběd'],
      useStock: true,
      plan: { days: [{ day: 'Pondělí', lunch: { name: 'forged' } }] },
    }))
    expect(response.status).toBe(200)
    expect(getHouseholdData).toHaveBeenCalledWith('user-1', 'Test', 'test@example.cz', true)
    expect(getMealPlanRecipePools).toHaveBeenCalledWith('household-1')
    expect(getPantryItems).toHaveBeenCalledWith('household-1')
    expect(generateWeeklyPlan).toHaveBeenCalledWith(
      500,
      {},
      [],
      expect.objectContaining({ dayCount: 2, mealTypes: ['Oběd'], recipePools: {} }),
    )
    expect(saveMealPlanForHousehold).toHaveBeenCalledWith('household-1', expect.any(String), 500, plan)
  })

  it('rejects invalid plan-generation options before loading household data', async () => {
    const response = await POST(request('/api/mobile/meal-plan', 'POST', {
      budgetLimit: -1,
      dayCount: 2,
      mealTypes: ['Oběd'],
      useStock: false,
    }))
    expect(response.status).toBe(400)
    expect(getHouseholdData).not.toHaveBeenCalled()
    expect(saveMealPlanForHousehold).not.toHaveBeenCalled()
  })

  it('updates servings through the current household plan and rejects values beyond the shared limit', async () => {
    const response = await PATCH(request('/api/mobile/meal-plan/servings', 'PATCH', {
      day: 'Pondělí',
      mealType: 'Oběd',
      servings: 3,
    }))
    expect(response.status).toBe(200)
    expect(updateCurrentMealServings).toHaveBeenCalledWith('household-1', expect.any(String), 'Pondělí', 'Oběd', 3)
    expect(getCurrentSavedMealPlan).toHaveBeenCalledWith('household-1')

    const invalid = await PATCH(request('/api/mobile/meal-plan/servings', 'PATCH', {
      day: 'Pondělí',
      mealType: 'Oběd',
      servings: MAX_MEAL_SERVINGS + 1,
    }))
    expect(invalid.status).toBe(400)
    expect(updateCurrentMealServings).toHaveBeenCalledTimes(1)
  })

  it('returns not found when the requested slot is absent from the current plan', async () => {
    updateCurrentMealServings.mockResolvedValueOnce(null)
    const response = await PATCH(request('/api/mobile/meal-plan/servings', 'PATCH', {
      day: 'Úterý',
      mealType: 'Snídaně',
      servings: 2,
    }))
    expect(response.status).toBe(404)
  })
})
