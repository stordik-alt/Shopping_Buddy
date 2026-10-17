import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAccessToken = vi.fn()
vi.mock('./auth', () => ({ getAccessToken: (...args: unknown[]) => getAccessToken(...args) }))
vi.mock('./config', () => ({ getApiUrl: () => 'https://anitka.example' }))

import { addShoppingItem, getShoppingList, MobileApiError, toggleShoppingItem } from './shopping-list-api'

describe('mobile shopping-list API client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAccessToken.mockResolvedValue('unit-test-access')
    vi.stubGlobal('fetch', vi.fn())
  })

  it('sends the authenticated request and returns the server-created item', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ item: { id: 'item-1', name: 'Mléko', quantity: 1, unit: 'l', done: false } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(addShoppingItem('Mléko', 'client-1')).resolves.toMatchObject({ item: { id: 'item-1' } })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://anitka.example/api/mobile/shopping-list',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: ['Bearer', 'unit-test-access'].join(' ') }),
        body: JSON.stringify({ name: 'Mléko', clientId: 'client-1' }),
      }),
    )
  })

  it('does not make a request when there is no authenticated session', async () => {
    getAccessToken.mockResolvedValue(null)
    await expect(getShoppingList()).rejects.toMatchObject({ code: 'not_signed_in', status: 401 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('surfaces server failures instead of returning a successful write', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'request_failed' }), { status: 500 }))
    await expect(toggleShoppingItem('item-1', true)).rejects.toMatchObject<Partial<MobileApiError>>({
      status: 500,
      code: 'request_failed',
      message: 'Změnu se nepodařilo uložit. Zkuste to znovu.',
    })
  })

  it('turns transport failures into a retryable network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Network unavailable'))
    await expect(getShoppingList()).rejects.toMatchObject({ status: 0, code: 'network_error' })
  })
})
