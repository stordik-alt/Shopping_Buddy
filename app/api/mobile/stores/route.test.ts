import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const getChainTiles = vi.fn()
const searchBranches = vi.fn()

vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/store-branch-search', () => ({
  getChainTiles: (...args: unknown[]) => getChainTiles(...args),
  searchBranches: (...args: unknown[]) => searchBranches(...args),
}))

import { GET } from '@/app/api/mobile/stores/route'

const request = (query = '') => new Request(`https://anitka.example/api/mobile/stores${query}`)
const chainId = '11111111-1111-4111-8111-111111111111'

describe('/api/mobile/stores', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'member' })
    getChainTiles.mockResolvedValue([{ storeId: chainId, chain: 'Albert', branchCount: 2, dealsCount: 1, isFavorite: false }])
    searchBranches.mockResolvedValue({ rows: [], total: 0, page: 1 })
  })

  it('searches chain tiles in a typed city', async () => {
    const response = await GET(request('?city=Brno'))

    expect(response.status).toBe(200)
    expect(getChainTiles).toHaveBeenCalledWith({ kind: 'city', text: 'Brno' }, 'member-1')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('searches one page of branches in the selected chain', async () => {
    const response = await GET(request(`?city=Brno&chainId=${chainId}&page=2`))

    expect(response.status).toBe(200)
    expect(searchBranches).toHaveBeenCalledWith({
      chainIds: [chainId],
      locality: { kind: 'city', text: 'Brno' },
      memberId: 'member-1',
      page: 2,
      pageSize: 5,
    })
  })

  it('searches chains around foreground coordinates with the shared five-kilometre radius', async () => {
    const response = await GET(request('?lat=50.087&lng=14.421'))

    expect(response.status).toBe(200)
    expect(getChainTiles).toHaveBeenCalledWith({
      kind: 'gps',
      center: { lat: 50.087, lng: 14.421 },
      radiusKm: 5,
    }, 'member-1')
  })

  it.each([
    '?lat=50.087',
    '?lng=14.421',
    '?lat=91&lng=14.421',
    '?lat=50.087&lng=181',
    '?lat=&lng=14.421',
  ])('rejects incomplete or invalid coordinates: %s', async (query) => {
    const response = await GET(request(query))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_location' })
    expect(getChainTiles).not.toHaveBeenCalled()
  })

  it('requires a household before exposing the store directory', async () => {
    mobileHouseholdForUser.mockResolvedValue(null)

    const response = await GET(request('?lat=50.087&lng=14.421'))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'household_required' })
    expect(getChainTiles).not.toHaveBeenCalled()
  })
})
