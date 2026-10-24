import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const getPrimaryShoppingListId = vi.fn()
const getShoppingListState = vi.fn()
const addShoppingItemForHousehold = vi.fn()

vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/auth/server', () => ({ auth: { getSession: vi.fn() } }))
vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }))
vi.mock('@/lib/db/queries', async (original) => ({
  ...(await original<typeof import('@/lib/db/queries')>()),
  getPrimaryShoppingListId: (...args: unknown[]) => getPrimaryShoppingListId(...args),
  getShoppingListState: (...args: unknown[]) => getShoppingListState(...args),
}))
vi.mock('@/lib/shopping-list-service', async (original) => ({
  ...(await original<typeof import('@/lib/shopping-list-service')>()),
  addShoppingItemForHousehold: (...args: unknown[]) => addShoppingItemForHousehold(...args),
}))

import { GET, POST } from '@/app/api/mobile/shopping-list/route'
import { MobileRequestAuthError } from '@/lib/auth/mobile-request'

const request = (method = 'GET', body?: unknown, path = '/api/mobile/shopping-list') =>
  new Request(`https://anitka.example${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

describe('/api/mobile/shopping-list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1', email: 'user@example.cz', name: 'Anna', emailVerified: true })
    mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1', role: 'owner' })
    getPrimaryShoppingListId.mockResolvedValue('list-1')
    getShoppingListState.mockResolvedValue({ listId: 'list-1', shoppingLists: ['Nákup'], lists: [{ id: 'list-1', name: 'Nákup' }], items: [] })
    addShoppingItemForHousehold.mockResolvedValue({ item: { id: 'item-1', name: 'Mléko', quantity: 1, unit: 'l', done: false }, notification: null })
  })

  it('returns a JSON 401 for unauthenticated API requests', async () => {
    mobileUserFromRequest.mockRejectedValue(new MobileRequestAuthError('not_signed_in', 401))
    const response = await GET(request())
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(mobileHouseholdForUser).not.toHaveBeenCalled()
  })

  it('does not expose a list for a user without household membership', async () => {
    mobileHouseholdForUser.mockResolvedValue(null)
    const response = await GET(request())
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'household_required' })
    expect(getShoppingListState).not.toHaveBeenCalled()
  })

  it('returns the current household list and list id without caching', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ listId: 'list-1', shoppingLists: ['Nákup'], lists: [{ id: 'list-1', name: 'Nákup' }], items: [] })
    expect(getShoppingListState).toHaveBeenCalledWith('household-1')
  })

  it('loads a selected list only through the authenticated household', async () => {
    getShoppingListState.mockResolvedValueOnce({ listId: 'list-2', shoppingLists: ['Nákup', 'Drogerie'], lists: [{ id: 'list-1', name: 'Nákup' }, { id: 'list-2', name: 'Drogerie' }], items: [] })
    const response = await GET(request('GET', undefined, '/api/mobile/shopping-list?listId=list-2'))
    expect(response.status).toBe(200)
    expect((await response.json()).listId).toBe('list-2')
    expect(getShoppingListState).toHaveBeenCalledWith('household-1', 'list-2')
  })

  it('does not return a selected list that is outside the household', async () => {
    getShoppingListState.mockResolvedValueOnce(null)
    const response = await GET(request('GET', undefined, '/api/mobile/shopping-list?listId=foreign-list'))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found' })
  })

  it('adds through the shared list service using the authenticated household and primary list', async () => {
    const response = await POST(request('POST', { name: 'Mléko', unit: 'l', quantity: 2, clientId: 'client-id' }))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ item: { id: 'item-1', name: 'Mléko' } })
    expect(addShoppingItemForHousehold).toHaveBeenCalledWith('household-1', 'user-1', 'list-1', 'Mléko', { quantity: 2, unit: 'l' }, 'client-id', undefined)
  })

  it('adds an item to the requested list through the household-scoped service', async () => {
    const response = await POST(request('POST', { name: 'Prací prášek', listId: 'list-2' }))
    expect(response.status).toBe(201)
    expect(addShoppingItemForHousehold).toHaveBeenCalledWith('household-1', 'user-1', 'list-2', 'Prací prášek', {}, undefined, undefined)
    expect(getPrimaryShoppingListId).not.toHaveBeenCalled()
  })

  it('keeps category and pantry-review detail when stock runs out', async () => {
    const response = await POST(request('POST', { name: 'Rýže', unit: 'kg', category: 'Potraviny', detail: 'došlo ze zásob', clientId: 'client-id' }))
    expect(response.status).toBe(201)
    expect(addShoppingItemForHousehold).toHaveBeenCalledWith(
      'household-1', 'user-1', 'list-1', 'Rýže', { unit: 'kg', category: 'Potraviny', detail: 'došlo ze zásob' }, 'client-id', undefined,
    )
  })

  it('keeps a concrete catalog product on the new shopping item', async () => {
    const response = await POST(request('POST', { name: 'Mléko 1 l', clientId: 'client-id', category: 'Potraviny', selection: { kind: 'product', productId: 'product-1' } }))
    expect(response.status).toBe(201)
    expect(addShoppingItemForHousehold).toHaveBeenCalledWith(
      'household-1', 'user-1', 'list-1', 'Mléko 1 l', { category: 'Potraviny' }, 'client-id', { kind: 'product', productId: 'product-1' },
    )
  })

  it('rejects unsupported units and empty names before writing', async () => {
    const invalidUnit = await POST(request('POST', { name: 'Mléko', unit: 'tuna' }))
    const emptyName = await POST(request('POST', { name: '  ' }))
    expect(invalidUnit.status).toBe(400)
    expect(emptyName.status).toBe(400)
    expect(addShoppingItemForHousehold).not.toHaveBeenCalled()
  })
})
