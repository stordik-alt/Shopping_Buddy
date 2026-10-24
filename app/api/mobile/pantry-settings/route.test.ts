import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const getDb = vi.fn()
vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/client', () => ({ getDb: () => getDb() }))

import { GET, PATCH } from '@/app/api/mobile/pantry-settings/route'
import { MobileRequestAuthError } from '@/lib/auth/mobile-request'

const request = (method = 'GET', body?: unknown) => new Request('https://anitka.example/api/mobile/pantry-settings', {
  method,
  headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

function emptyDb() {
  const innerBuilder = { where: vi.fn(() => ({ orderBy: vi.fn(async () => []) })) }
  const fromBuilder = {
    where: vi.fn(async () => []),
    innerJoin: vi.fn(() => innerBuilder),
  }
  return {
    query: {
      pantryPlaces: { findMany: vi.fn(async () => []) },
      pantryCheckinIntervals: { findMany: vi.fn(async () => []) },
      pantryCheckinSubcategoryIntervals: { findMany: vi.fn(async () => []) },
    },
    select: vi.fn(() => ({ from: vi.fn(() => fromBuilder) })),
  }
}

describe('/api/mobile/pantry-settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'member' })
    getDb.mockReturnValue(emptyDb())
  })

  it('returns household-scoped pantry configuration without caching', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({
      customPlaces: [],
      hiddenLocations: [],
      locationCounts: { Spíž: 0, Lednice: 0, Mrazák: 0 },
      checkinDays: {},
      subcategoryCheckinDays: {},
      stockLevels: [],
    })
    expect(mobileHouseholdForUser).toHaveBeenCalledWith('user-1')
  })

  it('does not read settings without an authenticated household', async () => {
    mobileUserFromRequest.mockRejectedValueOnce(new MobileRequestAuthError('not_signed_in', 401))
    expect((await GET(request())).status).toBe(401)
    mobileHouseholdForUser.mockResolvedValueOnce(null)
    expect((await GET(request())).status).toBe(409)
    expect(getDb).not.toHaveBeenCalled()
  })

  it('rejects malformed settings actions', async () => {
    const response = await PATCH(request('PATCH', { action: 'unknown' }))
    expect(response.status).toBe(400)
  })
})
