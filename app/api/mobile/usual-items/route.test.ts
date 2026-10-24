import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const getHouseholdPurchaseHistory = vi.fn()
const getPantryItems = vi.fn()
const getShoppingListState = vi.fn()
const suggestUsualItems = vi.fn()
const todayInPrague = vi.fn()

vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/queries', async (original) => ({
  ...(await original<typeof import('@/lib/db/queries')>()),
  getHouseholdPurchaseHistory: (...args: unknown[]) => getHouseholdPurchaseHistory(...args),
  getPantryItems: (...args: unknown[]) => getPantryItems(...args),
  getShoppingListState: (...args: unknown[]) => getShoppingListState(...args),
}))
vi.mock('@/lib/today', () => ({ todayInPrague: () => todayInPrague() }))
vi.mock('@/lib/usual-items', () => ({ suggestUsualItems: (...args: unknown[]) => suggestUsualItems(...args) }))

import { GET } from '@/app/api/mobile/usual-items/route'
import { MobileRequestAuthError } from '@/lib/auth/mobile-request'

const request = () => new Request('https://anitka.example/api/mobile/usual-items')

describe('/api/mobile/usual-items', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1', role: 'member' })
    getHouseholdPurchaseHistory.mockResolvedValue([{ id: 'purchase-1' }])
    getPantryItems.mockResolvedValue([{ name: 'Rýže' }])
    getShoppingListState.mockResolvedValue({ listId: 'list-1', items: [{ name: 'Mléko', done: false }, { name: 'Chléb', done: true }] })
    todayInPrague.mockReturnValue('2026-10-24')
    suggestUsualItems.mockReturnValue([{ name: 'Káva', quantity: 1, unit: 'ks' }])
  })

  it('requires an authenticated household', async () => {
    mobileUserFromRequest.mockRejectedValueOnce(new MobileRequestAuthError('not_signed_in', 401))
    expect((await GET(request())).status).toBe(401)
    mobileHouseholdForUser.mockResolvedValueOnce(null)
    expect((await GET(request())).status).toBe(409)
    expect(getHouseholdPurchaseHistory).not.toHaveBeenCalled()
  })

  it('derives suggestions only from the signed-in household and its open list/pantry', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ suggestions: [{ name: 'Káva', quantity: 1, unit: 'ks' }] })
    expect(getHouseholdPurchaseHistory).toHaveBeenCalledWith('household-1')
    expect(getPantryItems).toHaveBeenCalledWith('household-1')
    expect(getShoppingListState).toHaveBeenCalledWith('household-1')
    expect(suggestUsualItems).toHaveBeenCalledWith({
      purchases: [{ id: 'purchase-1' }],
      today: '2026-10-24',
      onList: ['Mléko'],
      inPantry: ['Rýže'],
    })
  })
})
