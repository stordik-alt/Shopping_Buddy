import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mobileUserFromRequest: vi.fn(),
  mobileHouseholdForUser: vi.fn(),
  getMemberStoreSelection: vi.fn(),
  searchProductHits: vi.fn(),
}))

vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mocks.mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mocks.mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/member-store-preferences', () => ({ getMemberStoreSelection: (...args: unknown[]) => mocks.getMemberStoreSelection(...args) }))
vi.mock('@/lib/db/product-search', () => ({ searchProductHits: (...args: unknown[]) => mocks.searchProductHits(...args) }))

import { POST } from '@/app/api/mobile/product-search/route'

const request = (body: unknown) => new Request('https://anitka.example/api/mobile/product-search', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('/api/mobile/product-search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mocks.mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1' })
    mocks.getMemberStoreSelection.mockResolvedValue({ maxDistanceKm: null, chainIds: ['chain-1'], branches: [], priorityChainIds: [], maxShopStores: null })
    mocks.searchProductHits.mockResolvedValue([])
  })

  it('restricts nearby product results to the member selection and category', async () => {
    const response = await POST(request({ query: 'mléko', onlyNearby: true, category: 'Potraviny' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ groups: [], nearbyOnly: true, hasNearbySelection: true })
    expect(mocks.getMemberStoreSelection).toHaveBeenCalledWith('member-1')
    expect(mocks.searchProductHits).toHaveBeenCalledWith(['mleko'], { storeIds: ['chain-1'], category: 'Potraviny' })
  })

  it('rejects malformed search input', async () => {
    const response = await POST(request({ query: 'mléko', onlyNearby: 'yes', extra: true }))
    expect(response.status).toBe(400)
    expect(mocks.searchProductHits).not.toHaveBeenCalled()
  })
})
