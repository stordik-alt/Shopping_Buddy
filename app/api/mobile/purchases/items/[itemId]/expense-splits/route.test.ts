import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(readonly code: string, readonly status: 401 | 403) { super(code) }
  }
  class PurchaseNotFoundError extends Error {}
  class InvalidExpenseCategoryError extends Error {}
  class InvalidExpenseSplitError extends Error {}
  return {
    mobileUserFromRequest: vi.fn(),
    mobileHouseholdForUser: vi.fn(),
    MobileRequestAuthError: AuthError,
    getHouseholdExpenses: vi.fn(),
    getDb: vi.fn(),
    setPurchaseItemExpenseSplits: vi.fn(),
    PurchaseNotFoundError,
    InvalidExpenseCategoryError,
    InvalidExpenseSplitError,
  }
})

vi.mock('@/lib/auth/mobile-request', () => ({
  mobileUserFromRequest: mocks.mobileUserFromRequest,
  mobileHouseholdForUser: mocks.mobileHouseholdForUser,
  MobileRequestAuthError: mocks.MobileRequestAuthError,
}))
vi.mock('@/lib/db/queries', () => ({ getHouseholdExpenses: mocks.getHouseholdExpenses }))
vi.mock('@/lib/db/client', () => ({ getDb: mocks.getDb }))
vi.mock('@/lib/db/purchase-items', () => ({
  setPurchaseItemExpenseSplits: mocks.setPurchaseItemExpenseSplits,
  PurchaseNotFoundError: mocks.PurchaseNotFoundError,
  InvalidExpenseCategoryError: mocks.InvalidExpenseCategoryError,
  InvalidExpenseSplitError: mocks.InvalidExpenseSplitError,
}))

import { PATCH } from '@/app/api/mobile/purchases/items/[itemId]/expense-splits/route'

const itemId = '00000000-0000-4000-8000-000000000001'
const params = { params: Promise.resolve({ itemId }) }
const input = { splits: [{ category: 'Děti', subcategory: 'Oblečení', amount: 60 }] }
const request = (body: unknown) => new Request(`https://anitka.example/api/mobile/purchases/items/${itemId}/expense-splits`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('PATCH /api/mobile/purchases/items/[itemId]/expense-splits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mocks.mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'member' })
    mocks.setPurchaseItemExpenseSplits.mockResolvedValue(undefined)
    mocks.getHouseholdExpenses.mockResolvedValue([{ id: 'expense-1' }])
    mocks.getDb.mockReturnValue({ query: { purchaseItems: { findFirst: vi.fn().mockResolvedValue({ purchaseId: 'purchase-1' }) } } })
  })

  it('requires a household and rejects malformed split structures', async () => {
    mocks.mobileHouseholdForUser.mockResolvedValueOnce(null)
    expect((await PATCH(request(input), params)).status).toBe(409)
    expect((await PATCH(request({ splits: [{ category: 'Děti', amount: -5 }] }), params)).status).toBe(400)
    expect(mocks.setPurchaseItemExpenseSplits).not.toHaveBeenCalled()
  })

  it('uses the shared split logic and reloads household expenses for the affected purchase', async () => {
    const response = await PATCH(request(input), params)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ expenses: [{ id: 'expense-1' }] })
    expect(mocks.setPurchaseItemExpenseSplits).toHaveBeenCalledWith('household-1', itemId, input.splits)
    expect(mocks.getHouseholdExpenses).toHaveBeenCalledWith('household-1', 'purchase-1')
  })

  it('hides purchase items that are not available to the household', async () => {
    mocks.setPurchaseItemExpenseSplits.mockRejectedValueOnce(new mocks.PurchaseNotFoundError())
    expect((await PATCH(request(input), params)).status).toBe(404)
    expect(mocks.getHouseholdExpenses).not.toHaveBeenCalled()
  })
})
