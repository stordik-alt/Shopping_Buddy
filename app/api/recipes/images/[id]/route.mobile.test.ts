import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(readonly code: string, readonly status: 401 | 403) {
      super(code)
    }
  }
  const limit = vi.fn().mockResolvedValue([{ imageRef: `r2:recipe-images/recepty-cz/${'a'.repeat(64)}.webp` }])
  const where = vi.fn(() => ({ limit }))
  const from = vi.fn(() => ({ where }))
  const select = vi.fn(() => ({ from }))
  return {
    AuthError,
    mobileUserFromRequest: vi.fn(),
    mobileHouseholdForUser: vi.fn(),
    requireHouseholdId: vi.fn(),
    r2GetObject: vi.fn(),
    getDb: vi.fn(() => ({ select })),
  }
})

vi.mock('@/lib/auth/authorize', () => ({ requireHouseholdId: mocks.requireHouseholdId }))
vi.mock('@/lib/auth/mobile-request', () => ({
  mobileUserFromRequest: mocks.mobileUserFromRequest,
  mobileHouseholdForUser: mocks.mobileHouseholdForUser,
  MobileRequestAuthError: mocks.AuthError,
}))
vi.mock('@/lib/db/client', () => ({ getDb: mocks.getDb }))
vi.mock('@/lib/storage/r2', () => ({ r2GetObject: mocks.r2GetObject }))

import { GET } from '@/app/api/recipes/images/[id]/route'

const recipeId = '11111111-1111-4111-8111-111111111111'
const request = (authorization?: string) => new Request('https://anitka.example/api/recipes/images/' + recipeId, {
  headers: authorization ? { Authorization: authorization } : {},
})

describe('GET /api/recipes/images/[id] mobile authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mocks.mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1' })
    mocks.r2GetObject.mockResolvedValue({
      body: new Response('image-bytes').body,
      contentType: 'image/webp',
    })
  })

  it('serves the private R2 image to an authenticated mobile household member', async () => {
    const response = await GET(request(['Bearer', 'unit-test-access'].join(' ')), { params: Promise.resolve({ id: recipeId }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(mocks.mobileUserFromRequest).toHaveBeenCalled()
    expect(mocks.r2GetObject).toHaveBeenCalledWith(`recipe-images/recepty-cz/${'a'.repeat(64)}.webp`)
  })

  it('rejects unauthenticated or household-less bearer requests without reading R2', async () => {
    mocks.mobileUserFromRequest.mockRejectedValue(new mocks.AuthError('invalid_token', 401))
    expect((await GET(request(['Bearer', 'unit-test-access'].join(' ')), { params: Promise.resolve({ id: recipeId }) })).status).toBe(401)

    mocks.mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mocks.mobileHouseholdForUser.mockResolvedValue(null)
    expect((await GET(request(['Bearer', 'unit-test-access'].join(' ')), { params: Promise.resolve({ id: recipeId }) })).status).toBe(409)
    expect(mocks.r2GetObject).not.toHaveBeenCalled()
  })
})
