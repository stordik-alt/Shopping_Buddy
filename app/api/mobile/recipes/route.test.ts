import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mobileUserFromRequest, mobileHouseholdForUser, searchRecipeCatalog, MobileRequestAuthError } = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(readonly code: string, readonly status: 401 | 403) {
      super(code)
    }
  }
  return {
    mobileUserFromRequest: vi.fn(),
    mobileHouseholdForUser: vi.fn(),
    searchRecipeCatalog: vi.fn(),
    MobileRequestAuthError: AuthError,
  }
})

vi.mock('@/lib/auth/mobile-request', () => ({
  mobileUserFromRequest,
  mobileHouseholdForUser,
  MobileRequestAuthError,
}))
vi.mock('@/lib/recipes/service', () => ({ searchRecipeCatalog }))
vi.mock('@/lib/recipes/sources', () => ({ RECIPE_SOURCE_ADAPTERS: [{ id: 'recepty-cz' }] }))

import { GET } from '@/app/api/mobile/recipes/route'

const request = (query = '') => new Request(`https://anitka.example/api/mobile/recipes${query}`)

describe('GET /api/mobile/recipes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1' })
    searchRecipeCatalog.mockResolvedValue({
      results: [
        {
          id: 'recipe-1',
          title: 'Polévka',
          imageUrl: '/api/recipes/images/recipe-1',
        },
        { id: 'recipe-2', title: 'Chléb' },
      ],
      total: 2,
      page: 1,
      pageSize: 6,
    })
  })

  it('requires an authenticated household before searching the shared catalog', async () => {
    mobileUserFromRequest.mockRejectedValue(new MobileRequestAuthError('invalid_token', 401))
    const unauthorized = await GET(request('?q=polévka'))
    expect(unauthorized.status).toBe(401)
    expect(searchRecipeCatalog).not.toHaveBeenCalled()

    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue(null)
    const noHousehold = await GET(request('?q=polévka'))
    expect(noHousehold.status).toBe(409)
    expect(searchRecipeCatalog).not.toHaveBeenCalled()
  })

  it('uses the existing catalog search and returns only authenticated R2 image routes', async () => {
    const response = await GET(request('?q=ku%C5%99ec%C3%AD%20maso&page=2&pageSize=6&sourceId=recepty-cz&sort=rating'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(searchRecipeCatalog).toHaveBeenCalledWith('kuřecí maso', {
      sourceId: 'recepty-cz',
      sort: 'rating',
      page: 2,
      pageSize: 6,
    })
    const body = await response.json()
    expect(body.results[0]).toMatchObject({ id: 'recipe-1', imageUrl: 'https://anitka.example/api/recipes/images/recipe-1' })
    expect(body.results[1]).not.toHaveProperty('imageUrl')
  })

  it('rejects unknown sources, unsupported sort orders, and out-of-range paging', async () => {
    for (const url of [
      '?q=polévka&sourceId=unknown',
      '?q=polévka&sort=newest',
      '?q=polévka&page=0',
      '?q=polévka&pageSize=13',
      `?q=${'a'.repeat(121)}`,
    ]) {
      expect((await GET(request(url))).status).toBe(400)
    }
    expect(searchRecipeCatalog).not.toHaveBeenCalled()
  })
})
