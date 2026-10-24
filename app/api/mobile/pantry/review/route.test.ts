import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(readonly code: string, readonly status: 401 | 403) { super(code) }
  }
  class ReviewInputError extends Error {}
  class ReviewNotFoundError extends Error {}
  return {
    AuthError,
    ReviewInputError,
    ReviewNotFoundError,
    mobileUserFromRequest: vi.fn(),
    mobileHouseholdForUser: vi.fn(),
    reviewPantryForHousehold: vi.fn(),
  }
})

vi.mock('@/lib/auth/mobile-request', () => ({
  MobileRequestAuthError: mocks.AuthError,
  mobileUserFromRequest: mocks.mobileUserFromRequest,
  mobileHouseholdForUser: mocks.mobileHouseholdForUser,
}))
vi.mock('@/lib/pantry-review', () => ({
  PantryReviewInputError: mocks.ReviewInputError,
  PantryReviewNotFoundError: mocks.ReviewNotFoundError,
  reviewPantryForHousehold: mocks.reviewPantryForHousehold,
}))

import { POST } from '@/app/api/mobile/pantry/review/route'

const request = (body: unknown) => new Request('https://anitka.example/api/mobile/pantry/review', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('POST /api/mobile/pantry/review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mocks.mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1' })
    mocks.reviewPantryForHousehold.mockResolvedValue({ removed: 1, confirmed: 2, adjusted: 1 })
  })

  it('saves an authenticated household review with the shared PWA domain action', async () => {
    const body = { reviewedIds: ['a', 'b'], goneIds: ['a'], quantities: [{ id: 'b', quantity: 1.5 }] }
    const response = await POST(request(body))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(mocks.reviewPantryForHousehold).toHaveBeenCalledWith({ householdId: 'household-1', ...body })
    expect(await response.json()).toEqual({ removed: 1, confirmed: 2, adjusted: 1 })
  })

  it('rejects unauthenticated, household-less, and malformed requests', async () => {
    mocks.mobileUserFromRequest.mockRejectedValue(new mocks.AuthError('invalid_token', 401))
    expect((await POST(request({ reviewedIds: [], goneIds: [] }))).status).toBe(401)
    mocks.mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mocks.mobileHouseholdForUser.mockResolvedValue(null)
    expect((await POST(request({ reviewedIds: [], goneIds: [] }))).status).toBe(409)
    mocks.mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1' })
    expect((await POST(request({ reviewedIds: 'bad', goneIds: [] }))).status).toBe(400)
    expect(mocks.reviewPantryForHousehold).not.toHaveBeenCalled()
  })

  it('maps foreign ids and invalid quantities to client errors', async () => {
    mocks.reviewPantryForHousehold.mockRejectedValueOnce(new mocks.ReviewNotFoundError('Pantry item not found'))
    expect((await POST(request({ reviewedIds: ['foreign'], goneIds: ['foreign'] }))).status).toBe(404)
    mocks.reviewPantryForHousehold.mockRejectedValueOnce(new mocks.ReviewInputError('Neplatné množství'))
    expect((await POST(request({ reviewedIds: ['item'], goneIds: [], quantities: [] }))).status).toBe(400)
  })
})
