import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const toggleShoppingItemForHousehold = vi.fn()
const updateShoppingItemForHousehold = vi.fn()

vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/auth/server', () => ({ auth: { getSession: vi.fn() } }))
vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }))
vi.mock('@/lib/shopping-list-service', async (original) => ({
  ...(await original<typeof import('@/lib/shopping-list-service')>()),
  toggleShoppingItemForHousehold: (...args: unknown[]) => toggleShoppingItemForHousehold(...args),
  updateShoppingItemForHousehold: (...args: unknown[]) => updateShoppingItemForHousehold(...args),
}))

import { PATCH } from '@/app/api/mobile/shopping-list/[itemId]/route'
import { ShoppingResourceNotFoundError } from '@/lib/shopping-list-service'

const request = (body: unknown) =>
  new Request('https://anitka.example/api/mobile/shopping-list/item-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const context = { params: Promise.resolve({ itemId: 'item-1' }) }

describe('PATCH /api/mobile/shopping-list/[itemId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1', email: 'user@example.cz', name: 'Anna', emailVerified: true })
    mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1', role: 'member' })
  })

  it('marks the item done only after the shared operation succeeds', async () => {
    const response = await PATCH(request({ done: true }), context)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(toggleShoppingItemForHousehold).toHaveBeenCalledWith('household-1', 'item-1', true)
  })

  it('updates quantity and unit using existing server-side validation', async () => {
    const response = await PATCH(request({ quantity: 1.5, unit: 'kg' }), context)
    expect(response.status).toBe(200)
    expect(updateShoppingItemForHousehold).toHaveBeenCalledWith('household-1', 'item-1', { quantity: 1.5, unit: 'kg' })
  })

  it('rejects unsupported input and does not report a write as successful', async () => {
    const response = await PATCH(request({ unit: 'tuna' }), context)
    expect(response.status).toBe(400)
    expect(toggleShoppingItemForHousehold).not.toHaveBeenCalled()
    expect(updateShoppingItemForHousehold).not.toHaveBeenCalled()
  })

  it('reports items outside the caller household as not found', async () => {
    updateShoppingItemForHousehold.mockRejectedValue(new ShoppingResourceNotFoundError('not found'))
    const response = await PATCH(request({ quantity: 3 }), context)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found' })
  })
})
