import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(readonly code: string, readonly status: 401 | 403) { super(code) }
  }
  class ManualInputError extends Error {}
  return {
    mobileUserFromRequest: vi.fn(),
    mobileHouseholdForUser: vi.fn(),
    MobileRequestAuthError: AuthError,
    getHouseholdPurchaseHistory: vi.fn(),
    createManualPurchaseForHousehold: vi.fn(),
    ManualPurchaseInputError: ManualInputError,
  }
})

vi.mock('@/lib/auth/mobile-request', () => ({
  mobileUserFromRequest: mocks.mobileUserFromRequest,
  mobileHouseholdForUser: mocks.mobileHouseholdForUser,
  MobileRequestAuthError: mocks.MobileRequestAuthError,
}))
vi.mock('@/lib/db/queries', () => ({ getHouseholdPurchaseHistory: mocks.getHouseholdPurchaseHistory }))
vi.mock('@/lib/db/manual-purchase', () => ({
  createManualPurchaseForHousehold: mocks.createManualPurchaseForHousehold,
  ManualPurchaseInputError: mocks.ManualPurchaseInputError,
}))

import { GET, POST } from '@/app/api/mobile/purchases/route'

const input = { date: '2026-10-24', storeChain: 'Lidl', discount: 2, items: [{ name: 'Mléko', quantity: 2, unit: 'l', price: 30, category: 'Potraviny', subcategory: null }] }
const request = (body: unknown) => new Request('https://anitka.example/api/mobile/purchases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('/api/mobile/purchases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mocks.mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'member' })
    mocks.createManualPurchaseForHousehold.mockResolvedValue({ purchase: { id: 'purchase-1' }, expenses: [], notifications: [], pantryItems: [] })
    mocks.getHouseholdPurchaseHistory.mockResolvedValue([])
  })

  it('keeps history reads limited to the authenticated household', async () => {
    const response = await GET(new Request('https://anitka.example/api/mobile/purchases'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ purchases: [] })
    expect(mocks.getHouseholdPurchaseHistory).toHaveBeenCalledWith('household-1')
  })

  it('rejects missing households and malformed purchase payloads', async () => {
    mocks.mobileHouseholdForUser.mockResolvedValueOnce(null)
    expect((await POST(request(input))).status).toBe(409)
    expect((await POST(request({ ...input, unexpected: true }))).status).toBe(400)
    expect((await POST(request({ ...input, items: [{ ...input.items[0], unexpected: true }] }))).status).toBe(400)
    expect(mocks.createManualPurchaseForHousehold).not.toHaveBeenCalled()
  })

  it('creates manual purchases through shared household logic', async () => {
    const response = await POST(request(input))
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ purchase: { id: 'purchase-1' }, expenses: [], notifications: [], pantryItems: [] })
    expect(mocks.createManualPurchaseForHousehold).toHaveBeenCalledWith('household-1', input)
  })

  it('returns validation feedback from the shared purchase rules', async () => {
    mocks.createManualPurchaseForHousehold.mockRejectedValueOnce(new mocks.ManualPurchaseInputError('Neplatná sleva.'))
    const response = await POST(request(input))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_manual_purchase', message: 'Neplatná sleva.' })
  })
})
