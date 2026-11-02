import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const getCurrentSavedMealPlan = vi.fn()
const saveMealPlanForHousehold = vi.fn()
const getHouseholdData = vi.fn()
const getPantryItems = vi.fn()
const getMealPlanRecipePools = vi.fn()
const regenerateMeal = vi.fn()
const recipeFor = vi.fn()

vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/meal-plans', () => ({
  getCurrentSavedMealPlan: (...args: unknown[]) => getCurrentSavedMealPlan(...args),
  saveMealPlanForHousehold: (...args: unknown[]) => saveMealPlanForHousehold(...args),
}))
vi.mock('@/lib/db/queries', () => ({
  getHouseholdData: (...args: unknown[]) => getHouseholdData(...args),
  getPantryItems: (...args: unknown[]) => getPantryItems(...args),
}))
vi.mock('@/lib/meal-plan-recipes', () => ({
  getMealPlanRecipePools: (...args: unknown[]) => getMealPlanRecipePools(...args),
}))
vi.mock('@/lib/meal-plans', async (original) => ({
  ...(await original<typeof import('@/lib/meal-plans')>()),
  regenerateMeal: (...args: unknown[]) => regenerateMeal(...args),
  recipeFor: (...args: unknown[]) => recipeFor(...args),
}))

import { POST } from '@/app/api/mobile/meal-plan/regenerate/route'

const currentPlan = { days: [], staples: [], estimatedTotal: 0, recommendedStores: [], cookedMeals: [] }
const nextPlan = { ...currentPlan, estimatedTotal: 100 }
const saved = { weekStart: '2026-11-02', budgetLimit: 500, plan: currentPlan }
const request = (body: unknown) => new Request('https://anitka.example/api/mobile/meal-plan/regenerate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('/api/mobile/meal-plan/regenerate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1', name: 'Test', email: 'test@example.cz', emailVerified: true })
    mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1', role: 'member' })
    getCurrentSavedMealPlan.mockResolvedValue(saved)
    getHouseholdData.mockResolvedValue({ household: { id: 'household-1' } })
    getMealPlanRecipePools.mockResolvedValue({ Snídaně: [] })
    getPantryItems.mockResolvedValue([])
    regenerateMeal.mockReturnValue(nextPlan)
    recipeFor.mockImplementation((plan: unknown) => ({ id: plan === nextPlan ? 'new' : 'old', name: plan === nextPlan ? 'Nové' : 'Staré', ingredients: [] }))
    saveMealPlanForHousehold.mockResolvedValue(undefined)
  })

  it('regenerates only the selected meal with the same weekly budget', async () => {
    const response = await POST(request({ day: 'Pondělí', mealType: 'Snídaně', useStock: true }))

    expect(response.status).toBe(200)
    expect(getHouseholdData).toHaveBeenCalledWith('user-1', 'Test', 'test@example.cz', true)
    expect(getPantryItems).toHaveBeenCalledWith('household-1')
    expect(regenerateMeal).toHaveBeenCalledWith(currentPlan, 'Pondělí', 'Snídaně', { id: 'household-1' }, [], { Snídaně: [] })
    expect(saveMealPlanForHousehold).toHaveBeenCalledWith('household-1', '2026-11-02', 500, nextPlan)
    expect(await response.json()).toHaveProperty('plan')
  })

  it('reports when the recipe pool has no alternative', async () => {
    recipeFor.mockReturnValue({ id: 'same', name: 'Stejné', ingredients: [] })
    const response = await POST(request({ day: 'Pondělí', mealType: 'Oběd', useStock: false }))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'no_alternative' })
    expect(saveMealPlanForHousehold).not.toHaveBeenCalled()
  })

  it('validates the selected slot and household before modification', async () => {
    expect((await POST(request({ day: 'Pondělí', mealType: 'Nesnídaně', useStock: true }))).status).toBe(400)
    expect(getCurrentSavedMealPlan).not.toHaveBeenCalled()

    mobileHouseholdForUser.mockResolvedValue(null)
    expect((await POST(request({ day: 'Pondělí', mealType: 'Snídaně', useStock: true }))).status).toBe(409)
    expect(getCurrentSavedMealPlan).not.toHaveBeenCalled()
  })
})
