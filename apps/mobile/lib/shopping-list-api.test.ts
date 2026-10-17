import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAccessToken = vi.fn()
vi.mock('./auth', () => ({ getAccessToken: (...args: unknown[]) => getAccessToken(...args) }))
vi.mock('./config', () => ({ getApiUrl: () => 'https://anitka.example' }))

import { addShoppingItem, getBudgetSummary, getPantry, getPendingReceiptImports, getRecipe, getShoppingList, lookupBarcode, MobileApiError, processReceiptImport, searchRecipes, toggleShoppingItem, updatePantryItem, uploadReceiptPhoto } from './shopping-list-api'

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

  it('reads the authenticated budget and pantry endpoints', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ currency: 'CZK', budget: 4000, spent: 1200, remaining: 2800, categories: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [], items: [] }), { status: 200 }))

    await expect(getBudgetSummary()).resolves.toMatchObject({ remaining: 2800 })
    await expect(getPantry()).resolves.toEqual({ places: [], items: [] })
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://anitka.example/api/mobile/budget', expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://anitka.example/api/mobile/pantry', expect.any(Object))
  })

  it('sends stock corrections to the pantry API', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await expect(updatePantryItem('item/1', { placeKey: 'Lednice' })).resolves.toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledWith(
      'https://anitka.example/api/mobile/pantry/item%2F1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ placeKey: 'Lednice' }) }),
    )
  })

  it('looks up a scanned barcode through the authenticated backend', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ name: 'Český produkt' }), { status: 200 }))
    await expect(lookupBarcode('4006381333931')).resolves.toEqual({ name: 'Český produkt' })
    expect(fetch).toHaveBeenCalledWith(
      'https://anitka.example/api/mobile/barcode',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: ['Bearer', 'unit-test-access'].join(' ') }),
        body: JSON.stringify({ barcode: '4006381333931' }),
      }),
    )
  })

  it('shows an actionable message for a barcode missing from the lookup source', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'product_not_found' }), { status: 404 }))
    await expect(lookupBarcode('4006381333931')).rejects.toMatchObject<Partial<MobileApiError>>({
      status: 404,
      code: 'product_not_found',
      message: 'K tomuto kódu jsme produkt nenašli. Zkuste položku zadat ručně.',
    })

    it('uploads a camera photo as multipart data without overriding its boundary header', async () => {
      const OriginalFormData = globalThis.FormData
      class NativeFormData {
        fields: Array<[string, unknown]> = []
        append(name: string, value: unknown) {
          this.fields.push([name, value])
        }
      }
      vi.stubGlobal('FormData', NativeFormData)
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ receipt: { id: 'receipt-1', status: 'uploaded' } }), { status: 201 }))

      try {
        await expect(uploadReceiptPhoto('file:///receipt.jpg')).resolves.toMatchObject({ receipt: { id: 'receipt-1' } })
        const [, init] = vi.mocked(fetch).mock.calls[0]
        const headers = new Headers(init?.headers)
        expect(headers.get('Authorization')).toBe(['Bearer', 'unit-test-access'].join(' '))
        expect(headers.has('Content-Type')).toBe(false)
        expect(init?.body).toBeInstanceOf(NativeFormData)
        expect((init?.body as NativeFormData).fields).toEqual([
          ['file', { uri: 'file:///receipt.jpg', name: 'receipt.jpg', type: 'image/jpeg' }],
        ])
      } finally {
        vi.stubGlobal('FormData', OriginalFormData)
      }
    })

    it('loads and processes household receipts through the bearer API', async () => {
      const fetchMock = vi.mocked(fetch)
      fetchMock
        .mockResolvedValueOnce(new Response(JSON.stringify({ receipts: [{ id: 'receipt-1', status: 'uploaded' }] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ receipt: { id: 'receipt-1', status: 'completed' } }), { status: 200 }))

      await expect(getPendingReceiptImports()).resolves.toMatchObject({ receipts: [{ id: 'receipt-1' }] })
      await expect(processReceiptImport('receipt-1', true)).resolves.toMatchObject({ receipt: { status: 'completed' } })
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://anitka.example/api/mobile/receipts',
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: ['Bearer', 'unit-test-access'].join(' ') }) }),
      )
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://anitka.example/api/mobile/receipts/receipt-1',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ retry: true }) }),
      )
    })

    it('shows server validation text for a rejected receipt photo', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: 'unsupported_format', message: 'Použijte JPEG.' }), { status: 415 }),
      )
      await expect(uploadReceiptPhoto('file:///receipt.jpg')).rejects.toMatchObject<Partial<MobileApiError>>({
        status: 415,
        code: 'unsupported_format',
        message: 'Použijte JPEG.',
      })
    })
  })

  it('searches the authenticated recipe catalog and loads a recipe by catalog id', async () => {
    const fetchMock = vi.mocked(fetch)
    const page = { results: [], total: 0, page: 1, pageSize: 6 }
    const recipe = { id: 'recipe-1', title: 'Polévka', ingredients: [] }
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(page), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(recipe), { status: 200 }))

    await expect(searchRecipes('kuřecí maso', 2)).resolves.toEqual(page)
    await expect(getRecipe('recipe/1')).resolves.toEqual(recipe)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://anitka.example/api/mobile/recipes?q=ku%C5%99ec%C3%AD%20maso&page=2',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: ['Bearer', 'unit-test-access'].join(' ') }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://anitka.example/api/mobile/recipes/recipe%2F1',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: ['Bearer', 'unit-test-access'].join(' ') }) }),
    )
  })
})
