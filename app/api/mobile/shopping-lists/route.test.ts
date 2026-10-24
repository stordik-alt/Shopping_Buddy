import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const findFirst = vi.fn()
const returning = vi.fn()
const values = vi.fn(() => ({ returning }))
const insert = vi.fn(() => ({ values }))
const getDb = vi.fn(() => ({ query: { shoppingLists: { findFirst } }, insert }))

vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/client', () => ({ getDb: () => getDb() }))

import { POST } from '@/app/api/mobile/shopping-lists/route'
import { MobileRequestAuthError } from '@/lib/auth/mobile-request'

const request = (body: unknown) => new Request('https://anitka.example/api/mobile/shopping-lists', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('/api/mobile/shopping-lists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1', email: 'user@example.cz' })
    mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1', role: 'owner' })
    findFirst.mockResolvedValue(undefined)
    returning.mockResolvedValue([{ id: 'list-2', name: 'Drogerie' }])
  })

  it('requires an authenticated household', async () => {
    mobileUserFromRequest.mockRejectedValueOnce(new MobileRequestAuthError('not_signed_in', 401))
    expect((await POST(request({ name: 'Drogerie' }))).status).toBe(401)
    mobileHouseholdForUser.mockResolvedValueOnce(null)
    expect((await POST(request({ name: 'Drogerie' }))).status).toBe(409)
    expect(getDb).not.toHaveBeenCalled()
  })

  it('creates a trimmed list for the authenticated household', async () => {
    const response = await POST(request({ name: '  Drogerie  ' }))
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ list: { id: 'list-2', name: 'Drogerie' } })
    expect(findFirst).toHaveBeenCalledOnce()
    expect(values).toHaveBeenCalledWith({ householdId: 'household-1', name: 'Drogerie' })
  })

  it('rejects duplicate names and malformed input', async () => {
    findFirst.mockResolvedValueOnce({ id: 'list-1' })
    expect((await POST(request({ name: 'Drogerie' }))).status).toBe(409)
    expect(insert).not.toHaveBeenCalled()
    expect((await POST(request({ name: '   ' }))).status).toBe(400)
    expect((await POST(request({ name: 'Drogerie', householdId: 'foreign' }))).status).toBe(400)
  })
})
