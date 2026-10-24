import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const listAuditLog = vi.fn()
vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/audit', () => ({ listAuditLog: (...args: unknown[]) => listAuditLog(...args) }))

import { GET } from '@/app/api/mobile/household-profile/audit-log/route'

describe('/api/mobile/household-profile/audit-log', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'owner' })
    listAuditLog.mockResolvedValue([{ id: 'audit-1', action: 'expense.added', actor: 'Jana', detail: { amount: 120 }, createdAt: '2026-10-24T12:00:00.000Z' }])
  })

  it('returns the household audit trail to its owner', async () => {
    const response = await GET(new Request('https://anitka.example/api/mobile/household-profile/audit-log'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ entries: [{ id: 'audit-1', actor: 'Jana' }] })
    expect(listAuditLog).toHaveBeenCalledWith('household-1', 100)
  })

  it('keeps the audit trail owner-only', async () => {
    mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'member' })
    const response = await GET(new Request('https://anitka.example/api/mobile/household-profile/audit-log'))
    expect(response.status).toBe(403)
    expect(listAuditLog).not.toHaveBeenCalled()
  })
})
