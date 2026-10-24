import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const getPrimaryShoppingListId = vi.fn()
const clearDoneShoppingItemsForHousehold = vi.fn()

vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/queries', async (original) => ({
  ...(await original<typeof import('@/lib/db/queries')>()),
  getPrimaryShoppingListId: (...args: unknown[]) => getPrimaryShoppingListId(...args),
}))
vi.mock('@/lib/shopping-list-service', async (original) => ({
  ...(await original<typeof import('@/lib/shopping-list-service')>()),
  clearDoneShoppingItemsForHousehold: (...args: unknown[]) => clearDoneShoppingItemsForHousehold(...args),
}))

import { POST } from '@/app/api/mobile/shopping-list/clear-done/route'
import { MobileRequestAuthError } from '@/lib/auth/mobile-request'

const request = (body?: unknown) => new Request('https://anitka.example/api/mobile/shopping-list/clear-done', {
  method: 'POST',
  ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
})

describe('/api/mobile/shopping-list/clear-done', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1', role: 'member' })
    getPrimaryShoppingListId.mockResolvedValue('list-1')
    clearDoneShoppingItemsForHousehold.mockResolvedValue({ removed: 2 })
  })

  it('requires a signed-in household before reading or clearing a list', async () => {
    mobileUserFromRequest.mockRejectedValueOnce(new MobileRequestAuthError('not_signed_in', 401))
    expect((await POST(request())).status).toBe(401)
    mobileHouseholdForUser.mockResolvedValueOnce(null)
    expect((await POST(request())).status).toBe(409)
    expect(getPrimaryShoppingListId).not.toHaveBeenCalled()
    expect(clearDoneShoppingItemsForHousehold).not.toHaveBeenCalled()
  })

  it('clears checked rows only from the authenticated household primary list', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ removed: 2 })
    expect(getPrimaryShoppingListId).toHaveBeenCalledWith('household-1')
    expect(clearDoneShoppingItemsForHousehold).toHaveBeenCalledWith('household-1', 'list-1')
  })

  it('clears checked rows from a selected list through the household-scoped service', async () => {
    const response = await POST(request({ listId: 'list-2' }))
    expect(response.status).toBe(200)
    expect(clearDoneShoppingItemsForHousehold).toHaveBeenCalledWith('household-1', 'list-2')
    expect(getPrimaryShoppingListId).not.toHaveBeenCalled()
  })
})
