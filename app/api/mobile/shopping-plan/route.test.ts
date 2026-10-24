import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mobileUserFromRequest: vi.fn(),
  mobileHouseholdForUser: vi.fn(),
  buildShoppingPlan: vi.fn(),
  listPinsForHousehold: vi.fn(),
  pinProduct: vi.fn(),
  unpinProduct: vi.fn(),
}))

vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mocks.mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mocks.mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/shopping-plan', () => ({
  buildShoppingPlan: (...args: unknown[]) => mocks.buildShoppingPlan(...args),
  listPinsForHousehold: (...args: unknown[]) => mocks.listPinsForHousehold(...args),
  pinProduct: (...args: unknown[]) => mocks.pinProduct(...args),
  unpinProduct: (...args: unknown[]) => mocks.unpinProduct(...args),
  PlanInputError: class PlanInputError extends Error {},
}))

import { GET, POST } from '@/app/api/mobile/shopping-plan/route'
import { PlanInputError } from '@/lib/db/shopping-plan'

const request = (method = 'GET', body?: unknown) => new Request('https://anitka.example/api/mobile/shopping-plan', {
  method,
  headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

describe('/api/mobile/shopping-plan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mocks.mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1' })
    mocks.listPinsForHousehold.mockResolvedValue([{ itemId: 'item-1', storeId: 'chain-1', productId: 'product-1' }])
    mocks.buildShoppingPlan.mockResolvedValue({ plan: { total: 25 }, allowedChains: [], usedNearbySelection: false, packageSizes: {}, packageCounts: {}, singleStoreTotals: [] })
  })

  it('returns household pins without caching', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ pins: [{ itemId: 'item-1', storeId: 'chain-1', productId: 'product-1' }] })
    expect(mocks.listPinsForHousehold).toHaveBeenCalledWith('household-1')
  })

  it('builds plans for the authenticated member and household', async () => {
    const response = await POST(request('POST', { action: 'build', maxStores: 2, priorityChainIds: ['chain-1'] }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ plan: { total: 25 } })
    expect(mocks.buildShoppingPlan).toHaveBeenCalledWith('household-1', 'member-1', { maxStores: 2, priorityChainIds: ['chain-1'] })
  })

  it('pins and unpins only through the authenticated household', async () => {
    expect((await POST(request('POST', { action: 'pin', itemId: 'item-1', storeId: 'chain-1', productId: 'product-1' }))).status).toBe(200)
    expect(mocks.pinProduct).toHaveBeenCalledWith('household-1', 'item-1', 'chain-1', 'product-1')
    expect((await POST(request('POST', { action: 'unpin', itemId: 'item-1', storeId: 'chain-1' }))).status).toBe(200)
    expect(mocks.unpinProduct).toHaveBeenCalledWith('household-1', 'item-1', 'chain-1')
  })

  it('returns a client error for invalid planner settings', async () => {
    mocks.buildShoppingPlan.mockRejectedValueOnce(new PlanInputError('Počet obchodů musí být celé číslo od 1 do 6.'))
    const response = await POST(request('POST', { action: 'build', maxStores: 0, priorityChainIds: [] }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_plan' })
  })
})
