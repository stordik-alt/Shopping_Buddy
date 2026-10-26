import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(readonly code: string, readonly status: 401 | 403) {
      super(code)
    }
  }
  return {
    mobileUserFromRequest: vi.fn(),
    mobileHouseholdForUser: vi.fn(),
    MobileRequestAuthError: AuthError,
    processReceiptImportForHousehold: vi.fn(),
    toReceiptImportState: vi.fn(),
    getReceiptListSuggestions: vi.fn(),
    confirmReceiptReviewForHousehold: vi.fn(),
    resolveDuplicateReceiptForHousehold: vi.fn(),
    cancelReceiptImportForHousehold: vi.fn(),
  }
})

vi.mock('@/lib/auth/mobile-request', () => ({
  mobileUserFromRequest: mocks.mobileUserFromRequest,
  mobileHouseholdForUser: mocks.mobileHouseholdForUser,
  MobileRequestAuthError: mocks.MobileRequestAuthError,
}))
vi.mock('@/lib/receipt-import', () => ({
  processReceiptImportForHousehold: mocks.processReceiptImportForHousehold,
  confirmReceiptReviewForHousehold: mocks.confirmReceiptReviewForHousehold,
  resolveDuplicateReceiptForHousehold: mocks.resolveDuplicateReceiptForHousehold,
  cancelReceiptImportForHousehold: mocks.cancelReceiptImportForHousehold,
}))
vi.mock('@/lib/db/queries', () => ({ toReceiptImportState: mocks.toReceiptImportState }))
vi.mock('@/lib/db/receipt-list', () => ({ getReceiptListSuggestions: mocks.getReceiptListSuggestions }))

import { DELETE, PATCH, POST } from '@/app/api/mobile/receipts/[id]/route'

const receiptId = '00000000-0000-4000-8000-000000000001'
const receiptRow = { id: receiptId, status: 'completed' }
const state = { id: receiptId, status: 'completed', hasImage: true }
const request = (body: unknown = { retry: false }, method = 'POST') =>
  new Request(`https://anitka.example/api/mobile/receipts/${receiptId}`, {
    method,
    headers: { Authorization: ['Bearer', 'route-test'].join(' '), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const params = { params: Promise.resolve({ id: receiptId }) }

describe('POST /api/mobile/receipts/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mocks.mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1', role: 'owner' })
    mocks.processReceiptImportForHousehold.mockResolvedValue({ kind: 'processed', row: receiptRow })
    mocks.toReceiptImportState.mockReturnValue(state)
    mocks.getReceiptListSuggestions.mockResolvedValue([])
    mocks.confirmReceiptReviewForHousehold.mockResolvedValue({ purchase: { id: 'purchase-1' }, aftermath: { purchaseHistory: [] } })
    mocks.resolveDuplicateReceiptForHousehold.mockResolvedValue({ purchase: null, aftermath: null })
    mocks.cancelReceiptImportForHousehold.mockResolvedValue(undefined)
  })

  it('requires verified auth and rejects malformed identifiers and requests', async () => {
    mocks.mobileUserFromRequest.mockRejectedValueOnce(new mocks.MobileRequestAuthError('not_signed_in', 401))
    const unauthorized = await POST(new Request('https://anitka.example/api/mobile/receipts/x', { method: 'POST' }), {
      params: Promise.resolve({ id: 'x' }),
    })
    expect(unauthorized.status).toBe(401)

    const malformedId = await POST(request(), { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(malformedId.status).toBe(404)

    const invalidBody = await POST(request({ retry: 'yes' }), params)
    expect(invalidBody.status).toBe(400)
    expect(mocks.processReceiptImportForHousehold).not.toHaveBeenCalled()
  })

  it('uses the authenticated household and returns only the shared receipt state', async () => {
    const response = await POST(request(), params)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ receipt: state })
    expect(mocks.processReceiptImportForHousehold).toHaveBeenCalledWith('household-1', receiptId, false)
    expect(mocks.toReceiptImportState).toHaveBeenCalledWith(receiptRow)
  })

  it('maps processing limits and concurrent claims to retryable responses', async () => {
    mocks.processReceiptImportForHousehold.mockResolvedValueOnce({ kind: 'rate_limited', error: 'Zkuste to později.' })
    const limited = await POST(request(), params)
    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({ error: 'ocr_rate_limited', message: 'Zkuste to později.' })

    mocks.processReceiptImportForHousehold.mockResolvedValueOnce({ kind: 'not_claimed' })
    const busy = await POST(request(), params)
    expect(busy.status).toBe(409)
    expect(await busy.json()).toEqual({ error: 'receipt_already_processing' })
  })

  it('marks retry attempts explicitly', async () => {
    const response = await POST(request({ retry: true }), params)
    expect(response.status).toBe(200)
    expect(mocks.processReceiptImportForHousehold).toHaveBeenCalledWith('household-1', receiptId, true)
  })

  it('confirms corrected OCR items within the authenticated household', async () => {
    const item = { name: 'Mléko', category: 'Potraviny', quantity: 1, unit: 'l', price: 30, location: 'Lednice' }
    const response = await PATCH(request({ action: 'confirm', items: [item], date: '2026-10-24' }, 'PATCH'), params)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ receipt: { id: receiptId, status: 'completed' }, purchase: { id: 'purchase-1' } })
    expect(mocks.confirmReceiptReviewForHousehold).toHaveBeenCalledWith('household-1', receiptId, [item], { date: '2026-10-24' })
    expect(mocks.getReceiptListSuggestions).toHaveBeenCalledWith('household-1', 'purchase-1')
  })

  it('validates review data and resolves duplicates', async () => {
    const invalid = await PATCH(request({ action: 'confirm', items: [{ name: '', category: 'Potraviny', quantity: 1, unit: 'l', price: 1 }] }, 'PATCH'), params)
    expect(invalid.status).toBe(400)
    expect(mocks.confirmReceiptReviewForHousehold).not.toHaveBeenCalled()

    const response = await PATCH(request({ action: 'resolve_duplicate', resolution: 'use_existing' }, 'PATCH'), params)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ receipt: { status: 'cancelled' }, purchase: null })
    expect(mocks.resolveDuplicateReceiptForHousehold).toHaveBeenCalledWith('household-1', receiptId, 'use_existing', undefined, { date: undefined })
  })

  it('cancels only the authenticated household receipt', async () => {
    const response = await DELETE(new Request(`https://anitka.example/api/mobile/receipts/${receiptId}`, { method: 'DELETE', headers: { Authorization: 'Bearer token' } }), params)
    expect(response.status).toBe(200)
    expect(mocks.cancelReceiptImportForHousehold).toHaveBeenCalledWith('household-1', receiptId)
  })
})
