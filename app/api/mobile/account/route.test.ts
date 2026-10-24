import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(readonly code: string, readonly status: 401 | 403) { super(code) }
  }
  class DeletionError extends Error {
    constructor(message: string, readonly status: 400 | 409 | 429) { super(message) }
  }
  return {
    mobileUserFromRequest: vi.fn(),
    mobileHouseholdForUser: vi.fn(),
    MobileRequestAuthError: AuthError,
    deleteAccountDataForUser: vi.fn(),
    AccountDeletionError: DeletionError,
  }
})

vi.mock('@/lib/auth/mobile-request', () => ({
  mobileUserFromRequest: mocks.mobileUserFromRequest,
  mobileHouseholdForUser: mocks.mobileHouseholdForUser,
  MobileRequestAuthError: mocks.MobileRequestAuthError,
}))
vi.mock('@/lib/account-deletion-service', () => ({
  deleteAccountDataForUser: mocks.deleteAccountDataForUser,
  AccountDeletionError: mocks.AccountDeletionError,
}))

import { POST } from '@/app/api/mobile/account/route'

const request = (body: unknown) => new Request('https://anitka.example/api/mobile/account', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

describe('/api/mobile/account', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mobileUserFromRequest.mockResolvedValue({ id: 'user-1', email: 'jana@example.cz' })
    mocks.mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'owner' })
    mocks.deleteAccountDataForUser.mockResolvedValue({ householdDeleted: true, photosFailed: 0 })
  })

  it('deletes data for the authenticated member through the shared account rules', async () => {
    const response = await POST(request({ email: 'Jana@example.cz' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ ok: true, householdDeleted: true, photosFailed: 0 })
    expect(mocks.deleteAccountDataForUser).toHaveBeenCalledWith({
      typedEmail: 'Jana@example.cz',
      userId: 'user-1',
      userEmail: 'jana@example.cz',
      householdId: 'household-1',
      memberId: 'member-1',
      role: 'owner',
    })
  })

  it('requires a household and a strict e-mail confirmation payload', async () => {
    mocks.mobileHouseholdForUser.mockResolvedValueOnce(null)
    expect((await POST(request({ email: 'jana@example.cz' }))).status).toBe(409)
    expect((await POST(request({ email: 'jana@example.cz', userId: 'other-user' }))).status).toBe(400)
    expect((await POST(request({ email: 42 }))).status).toBe(400)
    expect(mocks.deleteAccountDataForUser).not.toHaveBeenCalled()
  })

  it('preserves authentication and account-deletion errors as JSON responses', async () => {
    mocks.mobileUserFromRequest.mockRejectedValueOnce(new mocks.MobileRequestAuthError('invalid_token', 401))
    expect((await POST(request({ email: 'jana@example.cz' }))).status).toBe(401)
    mocks.deleteAccountDataForUser.mockRejectedValueOnce(new mocks.AccountDeletionError('Odeberte ostatní členy.', 409))
    const response = await POST(request({ email: 'jana@example.cz' }))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'account_deletion_rejected', message: 'Odeberte ostatní členy.' })
  })
})
