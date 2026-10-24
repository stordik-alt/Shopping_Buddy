import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(readonly code: string, readonly status: 401 | 403) { super(code) }
  }
  class PurchaseNotFoundError extends Error {}
  class AlreadyRecordedError extends Error {}
  class NotFromReceiptError extends Error {}
  class NothingToRecordError extends Error {}
  class PurchaseToDeleteNotFoundError extends Error {}
  return {
    mobileUserFromRequest: vi.fn(),
    mobileHouseholdForUser: vi.fn(),
    MobileRequestAuthError: AuthError,
    getHouseholdExpenses: vi.fn(),
    getHouseholdNotifications: vi.fn(),
    recordAudit: vi.fn(),
    recordPurchaseAsExpense: vi.fn(),
    deletePurchase: vi.fn(),
    PurchaseNotFoundError,
    AlreadyRecordedError,
    NotFromReceiptError,
    NothingToRecordError,
    PurchaseToDeleteNotFoundError,
  }
})

vi.mock('@/lib/auth/mobile-request', () => ({
  mobileUserFromRequest: mocks.mobileUserFromRequest,
  mobileHouseholdForUser: mocks.mobileHouseholdForUser,
  MobileRequestAuthError: mocks.MobileRequestAuthError,
}))
vi.mock('@/lib/db/queries', () => ({ getHouseholdExpenses: mocks.getHouseholdExpenses, getHouseholdNotifications: mocks.getHouseholdNotifications }))
vi.mock('@/lib/db/audit', () => ({ recordAudit: mocks.recordAudit }))
vi.mock('@/lib/db/purchase-items', () => ({
  recordPurchaseAsExpense: mocks.recordPurchaseAsExpense,
  PurchaseNotFoundError: mocks.PurchaseNotFoundError,
  AlreadyRecordedError: mocks.AlreadyRecordedError,
  NotFromReceiptError: mocks.NotFromReceiptError,
  NothingToRecordError: mocks.NothingToRecordError,
}))
vi.mock('@/lib/db/purchase-deletion', () => ({ deletePurchase: mocks.deletePurchase, PurchaseToDeleteNotFoundError: mocks.PurchaseToDeleteNotFoundError }))

import { DELETE, POST } from '@/app/api/mobile/purchases/[purchaseId]/route'

const purchaseId = '00000000-0000-4000-8000-000000000001'
const params = { params: Promise.resolve({ purchaseId }) }
const request = (method: 'POST' | 'DELETE' = 'POST') => new Request(`https://anitka.example/api/mobile/purchases/${purchaseId}`, { method })

describe('/api/mobile/purchases/[purchaseId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mocks.mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'member' })
    mocks.recordPurchaseAsExpense.mockResolvedValue(undefined)
    mocks.getHouseholdExpenses.mockResolvedValue([{ id: 'expense-1' }])
    mocks.getHouseholdNotifications.mockResolvedValue([])
    mocks.deletePurchase.mockResolvedValue({ date: '2026-10-24', untickedListItems: 1, pantryRowsChanged: 2 })
    mocks.recordAudit.mockResolvedValue(undefined)
  })

  it('requires a household and validates purchase ids', async () => {
    mocks.mobileUserFromRequest.mockRejectedValueOnce(new mocks.MobileRequestAuthError('not_signed_in', 401))
    expect((await POST(request(), params)).status).toBe(401)
    mocks.mobileHouseholdForUser.mockResolvedValueOnce(null)
    expect((await DELETE(request('DELETE'), params)).status).toBe(409)
    expect((await POST(request(), { params: Promise.resolve({ purchaseId: 'invalid' }) })).status).toBe(404)
    expect(mocks.recordPurchaseAsExpense).not.toHaveBeenCalled()
    expect(mocks.deletePurchase).not.toHaveBeenCalled()
  })

  it('records against the authenticated household and returns refreshed budget data', async () => {
    const response = await POST(request(), params)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ expenses: [{ id: 'expense-1' }], notifications: [] })
    expect(mocks.recordPurchaseAsExpense).toHaveBeenCalledWith('household-1', purchaseId)
    expect(mocks.getHouseholdExpenses).toHaveBeenCalledWith('household-1', purchaseId)
  })

  it('returns domain messages when a purchase cannot be recorded', async () => {
    mocks.recordPurchaseAsExpense.mockRejectedValueOnce(new mocks.AlreadyRecordedError('Už zapsáno.'))
    const response = await POST(request(), params)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'purchase_cannot_be_recorded', message: 'Už zapsáno.' })
  })

  it('deletes through the shared cleanup operation and writes an audit event', async () => {
    const response = await DELETE(request('DELETE'), params)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ date: '2026-10-24' })
    expect(mocks.deletePurchase).toHaveBeenCalledWith('household-1', purchaseId)
    expect(mocks.recordAudit).toHaveBeenCalledWith({ householdId: 'household-1', memberId: 'member-1' }, 'purchase.deleted', { date: '2026-10-24' }, purchaseId)
  })

  it('does not reveal a purchase outside the household', async () => {
    mocks.deletePurchase.mockRejectedValueOnce(new mocks.PurchaseToDeleteNotFoundError())
    expect((await DELETE(request('DELETE'), params)).status).toBe(404)
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })
})
