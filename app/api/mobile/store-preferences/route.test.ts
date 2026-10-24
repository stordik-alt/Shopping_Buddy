import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const getMemberStoreSelection = vi.fn()
const getStoreChains = vi.fn()
const saveMemberStoreSelection = vi.fn()
vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/member-store-preferences', async (original) => ({
  ...(await original<typeof import('@/lib/db/member-store-preferences')>()),
  getMemberStoreSelection: (...args: unknown[]) => getMemberStoreSelection(...args),
  getStoreChains: (...args: unknown[]) => getStoreChains(...args),
  saveMemberStoreSelection: (...args: unknown[]) => saveMemberStoreSelection(...args),
}))

import { GET, PATCH } from '@/app/api/mobile/store-preferences/route'

const request = (method = 'GET', body?: unknown) => new Request('https://anitka.example/api/mobile/store-preferences', {
  method,
  headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

describe('/api/mobile/store-preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'member' })
    getMemberStoreSelection.mockResolvedValue({ chainIds: [], branches: [], priorityChainIds: [], maxDistanceKm: null, maxShopStores: null })
    getStoreChains.mockResolvedValue([])
    saveMemberStoreSelection.mockResolvedValue({ chainIds: [], branches: [], priorityChainIds: [], maxDistanceKm: null, maxShopStores: null })
  })

  it('returns the signed-in member selection and available chains without caching', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(mobileHouseholdForUser).toHaveBeenCalledWith('user-1')
    expect(getMemberStoreSelection).toHaveBeenCalledWith('member-1')
    expect(getStoreChains).toHaveBeenCalledOnce()
  })

  it('saves only for the authenticated member and validates the submitted shape', async () => {
    const payload = { chainIds: ['chain-1'], locationIds: ['branch-1'], priorityChainIds: ['chain-1'], maxDistanceKm: 2, maxShopStores: 3 }
    expect((await PATCH(request('PATCH', payload))).status).toBe(200)
    expect(saveMemberStoreSelection).toHaveBeenCalledWith('member-1', payload)
    expect((await PATCH(request('PATCH', { ...payload, extra: true }))).status).toBe(400)
    expect(saveMemberStoreSelection).toHaveBeenCalledOnce()
  })
})
