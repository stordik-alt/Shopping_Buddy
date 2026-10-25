import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mobileUserFromRequest,
  mobileHouseholdForUser,
  getDb,
  getRecipeByUrl,
  getRecipeFavoriteState,
  recordRecipeView,
  MobileRequestAuthError,
} = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(readonly code: string, readonly status: 401 | 403) {
      super(code)
    }
  }
  const reference = { sourceId: 'recepty-cz', canonicalUrl: 'https://www.recepty.cz/polevka' }
  const limit = vi.fn().mockResolvedValue([reference])
  const where = vi.fn(() => ({ limit }))
  const from = vi.fn(() => ({ where }))
  const select = vi.fn(() => ({ from }))
  return {
    mobileUserFromRequest: vi.fn(),
    mobileHouseholdForUser: vi.fn(),
    getDb: vi.fn(() => ({ select })),
    getRecipeByUrl: vi.fn(),
    getRecipeFavoriteState: vi.fn(),
    recordRecipeView: vi.fn(),
    MobileRequestAuthError: AuthError,
  }
})

vi.mock('@/lib/auth/mobile-request', () => ({
  mobileUserFromRequest,
  mobileHouseholdForUser,
  MobileRequestAuthError,
}))
vi.mock('@/lib/db/client', () => ({ getDb }))
vi.mock('@/lib/db/recipes', () => ({ recordRecipeView, getRecipeFavoriteState }))
vi.mock('@/lib/recipes/service', () => ({ getRecipeByUrl }))

import { GET } from '@/app/api/mobile/recipes/[id]/route'

const recipe = {
  id: '11111111-1111-4111-8111-111111111111',
  sourceId: 'recepty-cz',
  canonicalUrl: 'https://www.recepty.cz/polevka',
  imageUrl: '/api/recipes/images/11111111-1111-4111-8111-111111111111',
  ingredients: [{ id: 'i-1', originalText: '1 mrkev', name: 'mrkev', scalable: true }],
}
const request = new Request('https://anitka.example/api/mobile/recipes/11111111-1111-4111-8111-111111111111')

describe('GET /api/mobile/recipes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1' })
    getRecipeByUrl.mockResolvedValue(recipe)
    getRecipeFavoriteState.mockResolvedValue(false)
  })

  it('loads catalog details and records viewing in the existing household history', async () => {
    const response = await GET(request, { params: Promise.resolve({ id: recipe.id }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(getRecipeByUrl).toHaveBeenCalledWith('recepty-cz', recipe.canonicalUrl)
    expect(recordRecipeView).toHaveBeenCalledWith('household-1', recipe)
    expect(getRecipeFavoriteState).toHaveBeenCalledWith('household-1', recipe.canonicalUrl)
    expect(await response.json()).toMatchObject({
      ...recipe,
      isFavorite: false,
      imageUrl: `https://anitka.example/api/recipes/images/${recipe.id}`,
    })
  })

  it('requires household authorization and rejects malformed catalog ids', async () => {
    mobileUserFromRequest.mockRejectedValue(new MobileRequestAuthError('not_signed_in', 401))
    expect((await GET(request, { params: Promise.resolve({ id: recipe.id }) })).status).toBe(401)

    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    expect((await GET(request, { params: Promise.resolve({ id: 'bad-id' }) })).status).toBe(404)
    expect(getRecipeByUrl).not.toHaveBeenCalled()
    expect(recordRecipeView).not.toHaveBeenCalled()
  })
})
