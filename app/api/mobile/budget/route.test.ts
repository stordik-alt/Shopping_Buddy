import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const getMobileBudgetState = vi.fn()

vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/queries', async (original) => ({
  ...(await original<typeof import('@/lib/db/queries')>()),
  getMobileBudgetState: (...args: unknown[]) => getMobileBudgetState(...args),
}))

import { GET } from '@/app/api/mobile/budget/route'
import { MobileRequestAuthError } from '@/lib/auth/mobile-request'

const request = () => new Request('https://anitka.example/api/mobile/budget')

describe('/api/mobile/budget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1', role: 'member' })
    getMobileBudgetState.mockResolvedValue({ budget: 4000, spent: 1200, remaining: 2800, categories: [] })
  })

  it('requires an authenticated user and does not cache the household response', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ remaining: 2800 })
    expect(getMobileBudgetState).toHaveBeenCalledWith('household-1')

    mobileUserFromRequest.mockRejectedValue(new MobileRequestAuthError('not_signed_in', 401))
    const unauthorized = await GET(request())
    expect(unauthorized.status).toBe(401)
    expect(getMobileBudgetState).toHaveBeenCalledTimes(1)
  })

  it('does not expose budget data without household membership', async () => {
    mobileHouseholdForUser.mockResolvedValue(null)
    const response = await GET(request())
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'household_required' })
    expect(getMobileBudgetState).not.toHaveBeenCalled()
  })
})
