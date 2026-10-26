import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-observe', () => ({ Observe: { reportError: vi.fn(), dispatchEvents: vi.fn().mockResolvedValue(undefined) } }))

const clearAccessToken = vi.fn()

const getAccessToken = vi.fn()
const getStoredAuthCookie = vi.fn()
const usesLocalAuth = vi.fn()
vi.mock('./auth', () => ({
  clearAccessToken: (...args: unknown[]) => clearAccessToken(...args),
  getAccessToken: (...args: unknown[]) => getAccessToken(...args),
  getStoredAuthCookie: (...args: unknown[]) => getStoredAuthCookie(...args),
  usesLocalAuth: (...args: unknown[]) => usesLocalAuth(...args),
}))
vi.mock('./config', () => ({ getApiUrl: () => 'https://anitka.example' }))

import { Observe } from 'expo-observe'
import { addShoppingItem, buildShoppingPlan, cancelReceiptImport, confirmReceiptReview, createShoppingList, getBudgetSummary, getPantry, getPendingReceiptImports, getRecipe, getShoppingList, getUsualItems, importManualReceipt, lookupBarcode, MobileApiError, pinShoppingProduct, processReceiptImport, receiptImageUrl, resolveDuplicateReceipt, reviewPantry, searchProducts, searchRecipes, toggleShoppingItem, unpinShoppingProduct, updatePantryItem, uploadReceiptFile, uploadReceiptPhoto } from './shopping-list-api'

describe('mobile shopping-list API client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAccessToken.mockResolvedValue('unit-test-access')
    getStoredAuthCookie.mockResolvedValue('')
    usesLocalAuth.mockReturnValue(false)
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

  it('sends a suggested quantity and unit when adding a restock recommendation', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ item: { id: 'item-2', name: 'Mléko', quantity: 1.5, unit: 'l', done: false } }), { status: 201 }))
    await addShoppingItem('Mléko', 'client-2', 1.5, 'l')
    expect(fetch).toHaveBeenCalledWith(
      'https://anitka.example/api/mobile/shopping-list',
      expect.objectContaining({ body: JSON.stringify({ name: 'Mléko', clientId: 'client-2', quantity: 1.5, unit: 'l' }) }),
    )
  })

  it('keeps pantry review category and detail when adding an item that ran out', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ item: { id: 'item-3', name: 'Rýže', quantity: 1, unit: 'kg', done: false } }), { status: 201 }))
    await addShoppingItem('Rýže', 'client-3', 1, 'kg', { category: 'Potraviny', detail: 'došlo ze zásob' })
    expect(fetch).toHaveBeenCalledWith(
      'https://anitka.example/api/mobile/shopping-list',
      expect.objectContaining({ body: JSON.stringify({ name: 'Rýže', clientId: 'client-3', unit: 'kg', category: 'Potraviny', detail: 'došlo ze zásob' }) }),
    )
  })

  it('adds a chosen catalog product with its category and product id', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ item: { id: 'item-4', name: 'Mléko 1 l', quantity: 1, unit: 'l', done: false } }), { status: 201 }))
    await addShoppingItem('Mléko 1 l', 'client-4', 1, 'l', { category: 'Potraviny', selection: { kind: 'product', productId: 'product-4' } })
    expect(fetch).toHaveBeenCalledWith('https://anitka.example/api/mobile/shopping-list', expect.objectContaining({ body: JSON.stringify({ name: 'Mléko 1 l', clientId: 'client-4', unit: 'l', category: 'Potraviny', selection: { kind: 'product', productId: 'product-4' } }) }))
  })

  it('targets the selected list for reads, writes, usual-item suggestions, and list creation', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ listId: 'list-2', items: [], shoppingLists: ['Nákup', 'Drogerie'] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ item: { id: 'item-5', name: 'Prášek', quantity: 1, unit: 'ks', done: false } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ suggestions: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ list: { id: 'list-3', name: 'Lékárna' } }), { status: 201 }))

    await getShoppingList('list-2')
    await addShoppingItem('Prášek', 'client-5', 1, 'ks', { listId: 'list-2' })
    await getUsualItems('list-2')
    await createShoppingList('Lékárna')

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://anitka.example/api/mobile/shopping-list?listId=list-2', expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://anitka.example/api/mobile/shopping-list', expect.objectContaining({ body: JSON.stringify({ name: 'Prášek', clientId: 'client-5', listId: 'list-2' }) }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'https://anitka.example/api/mobile/usual-items?listId=list-2', expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(4, 'https://anitka.example/api/mobile/shopping-lists', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Lékárna' }) }))
  })

  it('searches products, plans shopping, and pins a product using authenticated mobile routes', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ groups: [], nearbyOnly: true, hasNearbySelection: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ plan: { total: 25 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await expect(searchProducts({ query: 'mléko', onlyNearby: true, category: 'Potraviny' })).resolves.toMatchObject({ nearbyOnly: true })
    await expect(buildShoppingPlan({ maxStores: 2, priorityChainIds: ['chain-1'] })).resolves.toMatchObject({ plan: { total: 25 } })
    await expect(pinShoppingProduct({ itemId: 'item-1', storeId: 'chain-1', productId: 'product-1' })).resolves.toEqual({ ok: true })
    await expect(unpinShoppingProduct({ itemId: 'item-1', storeId: 'chain-1' })).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://anitka.example/api/mobile/product-search', expect.objectContaining({ method: 'POST', body: JSON.stringify({ query: 'mléko', onlyNearby: true, category: 'Potraviny' }) }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://anitka.example/api/mobile/shopping-plan', expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'build', maxStores: 2, priorityChainIds: ['chain-1'] }) }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'https://anitka.example/api/mobile/shopping-plan', expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'pin', itemId: 'item-1', storeId: 'chain-1', productId: 'product-1' }) }))
    expect(fetchMock).toHaveBeenNthCalledWith(4, 'https://anitka.example/api/mobile/shopping-plan', expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'unpin', itemId: 'item-1', storeId: 'chain-1' }) }))
  })

  it('sends the checked stock ids and remaining quantities to the shared review API', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ removed: 1, confirmed: 1, adjusted: 1 }), { status: 200 }))
    const input = { reviewedIds: ['one', 'two'], goneIds: ['one'], quantities: [{ id: 'two', quantity: 0.5 }] }
    await expect(reviewPantry(input)).resolves.toEqual({ removed: 1, confirmed: 1, adjusted: 1 })
    expect(fetch).toHaveBeenCalledWith(
      'https://anitka.example/api/mobile/pantry/review',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    )
  })

  it('does not make a request when there is no authenticated session', async () => {
    getAccessToken.mockResolvedValue(null)
    await expect(getShoppingList()).rejects.toMatchObject({ code: 'not_signed_in', status: 401 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports an API 401 to EAS Observe without including credentials', async () => {
    getAccessToken.mockResolvedValue('test-token')
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401 }))

    await expect(getShoppingList()).rejects.toMatchObject({ status: 401, code: 'invalid_token' })

    expect(Observe.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'ANITKA mobile API auth diagnostic: status=401; code=invalid_token' }),
    )
    expect(clearAccessToken).toHaveBeenCalledOnce()
  })

  it('uses the stored session cookie in local auth mode when no bearer JWT is available', async () => {
    getAccessToken.mockResolvedValue(null)
    usesLocalAuth.mockReturnValue(true)
    getStoredAuthCookie.mockResolvedValue('better-auth.session_token=local-session')
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ listId: 'list-1', items: [], shoppingLists: [] }), { status: 200 }))

    await expect(getShoppingList()).resolves.toMatchObject({ listId: 'list-1' })
    expect(fetch).toHaveBeenCalledWith('https://anitka.example/api/mobile/shopping-list', expect.objectContaining({
      headers: expect.objectContaining({ Cookie: 'better-auth.session_token=local-session' }),
    }))
  })

  it('uses the native cookie jar in local auth mode when no cookie header is exposed', async () => {
    getAccessToken.mockResolvedValue(null)
    usesLocalAuth.mockReturnValue(true)
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ listId: 'list-1', items: [], shoppingLists: [] }), { status: 200 }))

    await expect(getShoppingList()).resolves.toMatchObject({ listId: 'list-1' })
    expect(fetch).toHaveBeenCalledWith('https://anitka.example/api/mobile/shopping-list', expect.objectContaining({ credentials: 'include' }))
    expect(new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).get('cookie')).toBeNull()
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
  })

  it('uploads a camera photo as multipart data without overriding its boundary header', async () => {
      const OriginalFormData = FormData
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
        const headers = init?.headers as Record<string, string>
        expect(headers.Authorization).toBe(['Bearer', 'unit-test-access'].join(' '))
        expect(headers['Content-Type']).toBeUndefined()
        expect(init?.body).toBeInstanceOf(NativeFormData)
        expect((init?.body as unknown as NativeFormData).fields).toEqual([
          ['file', { uri: 'file:///receipt.jpg', name: 'receipt.jpg', type: 'image/jpeg' }],
        ])
      } finally {
        vi.stubGlobal('FormData', OriginalFormData)
      }
  })

  it('preserves the chosen receipt file name and type for gallery photos and PDFs', async () => {
    const OriginalFormData = FormData
    class NativeFormData {
      fields: Array<[string, unknown]> = []
      append(name: string, value: unknown) { this.fields.push([name, value]) }
    }
    vi.stubGlobal('FormData', NativeFormData)
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ receipt: { id: 'receipt-pdf', status: 'uploaded' } }), { status: 201 }))
    try {
      await uploadReceiptFile('file:///download/uctenka.pdf', 'uctenka.pdf', 'application/pdf')
      expect((vi.mocked(fetch).mock.calls[0][1]?.body as unknown as NativeFormData).fields).toEqual([
        ['file', { uri: 'file:///download/uctenka.pdf', name: 'uctenka.pdf', type: 'application/pdf' }],
      ])
    } finally {
      vi.stubGlobal('FormData', OriginalFormData)
    }
  })

  it('imports manual receipt lines through the receipt pipeline and authenticated household API', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ receipt: { id: 'receipt-manual', status: 'imported' }, purchase: { id: 'purchase-1' } }), { status: 201 }))
    const input = { date: '2026-10-24', storeChain: 'Lidl', discount: 4, items: [{ name: 'Mléko', quantity: 2, unit: 'l' as const, price: 30, category: 'Potraviny' as const, subcategory: null }] }
    await expect(importManualReceipt(input)).resolves.toMatchObject({ receipt: { status: 'imported' }, purchase: { id: 'purchase-1' } })
    expect(fetch).toHaveBeenCalledWith('https://anitka.example/api/mobile/receipts/manual', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: ['Bearer', 'unit-test-access'].join(' ') }),
      body: JSON.stringify({ date: input.date, storeName: 'Lidl', discount: 4, items: input.items }),
    }))
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

  it('confirms OCR reviews and resolves duplicate receipts through bearer-authenticated actions', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ receipt: { id: 'receipt-1', status: 'completed' }, purchase: { id: 'purchase-1' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ receipt: { id: 'receipt-1', status: 'cancelled' }, purchase: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const items = [{ name: 'Mléko', category: 'Potraviny' as const, quantity: 1, unit: 'l' as const, price: 30, location: 'Lednice' as const }]

    await expect(confirmReceiptReview('receipt-1', items, '2026-10-24')).resolves.toMatchObject({ receipt: { status: 'completed' } })
    await expect(resolveDuplicateReceipt('receipt-1', 'use_existing')).resolves.toMatchObject({ receipt: { status: 'cancelled' } })
    await expect(cancelReceiptImport('receipt-1')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://anitka.example/api/mobile/receipts/receipt-1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ action: 'confirm', items, date: '2026-10-24' }) }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://anitka.example/api/mobile/receipts/receipt-1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ action: 'resolve_duplicate', resolution: 'use_existing' }) }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'https://anitka.example/api/mobile/receipts/receipt-1', expect.objectContaining({ method: 'DELETE' }))
    expect(receiptImageUrl('receipt-1')).toBe('https://anitka.example/api/mobile/receipts/receipt-1/image')
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
