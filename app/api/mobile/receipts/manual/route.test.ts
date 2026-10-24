import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(readonly code: string, readonly status: 401 | 403) { super(code) }
  }
  return {
    mobileUserFromRequest: vi.fn(),
    mobileHouseholdForUser: vi.fn(),
    MobileRequestAuthError: AuthError,
    importManualReceiptForHousehold: vi.fn(),
  }
})

vi.mock('@/lib/auth/mobile-request', () => ({
  mobileUserFromRequest: mocks.mobileUserFromRequest,
  mobileHouseholdForUser: mocks.mobileHouseholdForUser,
  MobileRequestAuthError: mocks.MobileRequestAuthError,
}))
vi.mock('@/lib/receipt-import', () => ({ importManualReceiptForHousehold: mocks.importManualReceiptForHousehold }))

import { POST } from '@/app/api/mobile/receipts/manual/route'

const input = {
  date: '2026-10-24',
  storeName: 'Lidl',
  discount: 2,
  items: [{ name: 'Mléko', quantity: 2, unit: 'l', price: 30, category: 'Potraviny', subcategory: null }],
}
const request = (body: unknown) => new Request('https://anitka.example/api/mobile/receipts/manual', {
  method: 'POST',
  headers: { authorization: 'Bearer token', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

describe('POST /api/mobile/receipts/manual', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mocks.mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'member' })
    mocks.importManualReceiptForHousehold.mockResolvedValue({ receipt: { id: 'receipt-1', status: 'imported' }, purchase: { id: 'purchase-1' } })
  })

  it('rejects missing auth, missing households, and malformed rows', async () => {
    expect((await POST(new Request('https://anitka.example/api/mobile/receipts/manual', { method: 'POST' }))).status).toBe(401)
    mocks.mobileHouseholdForUser.mockResolvedValueOnce(null)
    expect((await POST(request(input))).status).toBe(409)
    expect((await POST(request({ ...input, items: [{ ...input.items[0], unit: 'gallon' }] }))).status).toBe(400)
    expect((await POST(request({ ...input, discount: 1000 }))).status).toBe(400)
    expect(mocks.importManualReceiptForHousehold).not.toHaveBeenCalled()
  })

  it('imports a manual receipt only into the authenticated household', async () => {
    const response = await POST(request(input))
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ receipt: { id: 'receipt-1', status: 'imported' }, purchase: { id: 'purchase-1' } })
    expect(mocks.importManualReceiptForHousehold).toHaveBeenCalledWith('household-1', [{
      name: 'Mléko', quantity: 2, unit: 'l', price: 30, category: 'Potraviny', classificationSource: 'manual',
    }], { date: '2026-10-24', storeName: 'Lidl', receiptDiscountTotal: 2 })
  })
})
