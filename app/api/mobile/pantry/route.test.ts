import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const getMobilePantryState = vi.fn()
const updatePantryItemForHousehold = vi.fn()

vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/queries', async (original) => ({
  ...(await original<typeof import('@/lib/db/queries')>()),
  getMobilePantryState: (...args: unknown[]) => getMobilePantryState(...args),
}))
vi.mock('@/lib/pantry-mobile-mutations', async (original) => ({
  ...(await original<typeof import('@/lib/pantry-mobile-mutations')>()),
  updatePantryItemForHousehold: (...args: unknown[]) => updatePantryItemForHousehold(...args),
}))

import { GET } from '@/app/api/mobile/pantry/route'
import { PATCH } from '@/app/api/mobile/pantry/[itemId]/route'
import { MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { PantryInputError, PantryResourceNotFoundError } from '@/lib/pantry-mobile-mutations'

const readRequest = () => new Request('https://anitka.example/api/mobile/pantry')
const patchRequest = (body: unknown) => new Request('https://anitka.example/api/mobile/pantry/item-1', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const context = { params: Promise.resolve({ itemId: 'item-1' }) }

describe('/api/mobile/pantry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1', role: 'member' })
    getMobilePantryState.mockResolvedValue({ places: [], items: [] })
  })

  it('reads only the authenticated household stock without caching', async () => {
    const response = await GET(readRequest())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(getMobilePantryState).toHaveBeenCalledWith('household-1')
  })

  it('rejects unauthenticated and non-member reads', async () => {
    mobileUserFromRequest.mockRejectedValue(new MobileRequestAuthError('not_signed_in', 401))
    expect((await GET(readRequest())).status).toBe(401)
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue(null)
    expect((await GET(readRequest())).status).toBe(409)
    expect(getMobilePantryState).not.toHaveBeenCalled()
  })

  it('updates stock through household-scoped mutations and rejects malformed changes', async () => {
    const response = await PATCH(patchRequest({ quantity: 0 }), context)
    expect(response.status).toBe(200)
    expect(updatePantryItemForHousehold).toHaveBeenCalledWith('household-1', 'item-1', { quantity: 0 })

    updatePantryItemForHousehold.mockRejectedValueOnce(new PantryInputError('Množství nesmí být záporné.'))
    const rejected = await PATCH(patchRequest({ quantity: -1 }), context)
    expect(rejected.status).toBe(400)
    expect((await PATCH(patchRequest({ quantity: 1, placeKey: 'Lednice' }), context)).status).toBe(400)
  })

  it('does not allow editing an item outside the authenticated household', async () => {
    updatePantryItemForHousehold.mockRejectedValue(new PantryResourceNotFoundError('Pantry item not found'))
    const response = await PATCH(patchRequest({ placeKey: 'Mrazák' }), context)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found' })
  })
})
