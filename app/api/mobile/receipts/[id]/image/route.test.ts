import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(readonly code: string, readonly status: 401 | 403) { super(code) }
  }
  return { mobileUserFromRequest: vi.fn(), mobileHouseholdForUser: vi.fn(), assertOwnsReceiptImport: vi.fn(), getReceiptFile: vi.fn(), MobileRequestAuthError: AuthError }
})

vi.mock('@/lib/auth/mobile-request', () => ({
  mobileUserFromRequest: mocks.mobileUserFromRequest,
  mobileHouseholdForUser: mocks.mobileHouseholdForUser,
  MobileRequestAuthError: mocks.MobileRequestAuthError,
}))
vi.mock('@/lib/receipt-import', () => ({ assertOwnsReceiptImport: mocks.assertOwnsReceiptImport }))
vi.mock('@/lib/storage', () => ({ getReceiptFile: mocks.getReceiptFile }))

import { GET } from '@/app/api/mobile/receipts/[id]/image/route'

const receiptId = '00000000-0000-4000-8000-000000000001'
const params = { params: Promise.resolve({ id: receiptId }) }

describe('GET /api/mobile/receipts/[id]/image', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mocks.mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1' })
    mocks.assertOwnsReceiptImport.mockResolvedValue({ imageUrl: 'private/receipt.jpg' })
    mocks.getReceiptFile.mockResolvedValue({ body: 'image-bytes', contentType: 'image/jpeg' })
  })

  it('requires verified auth and returns no-store bytes for the member household', async () => {
    mocks.mobileUserFromRequest.mockRejectedValueOnce(new mocks.MobileRequestAuthError('not_signed_in', 401))
    const unauthorized = await GET(new Request('https://anitka.example/api/mobile/receipts/' + receiptId + '/image'), params)
    expect(unauthorized.status).toBe(401)

    const response = await GET(new Request('https://anitka.example/api/mobile/receipts/' + receiptId + '/image', { headers: { authorization: 'Bearer token' } }), params)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.text()).toBe('image-bytes')
    expect(mocks.assertOwnsReceiptImport).toHaveBeenCalledWith('household-1', receiptId)
    expect(mocks.getReceiptFile).toHaveBeenCalledWith('private/receipt.jpg')
  })

  it('does not reveal files outside the authenticated household', async () => {
    mocks.assertOwnsReceiptImport.mockRejectedValueOnce(new Error('Receipt import not found'))
    const response = await GET(new Request('https://anitka.example/api/mobile/receipts/' + receiptId + '/image', { headers: { authorization: 'Bearer token' } }), params)
    expect(response.status).toBe(404)
    expect(mocks.getReceiptFile).not.toHaveBeenCalled()
  })
})
