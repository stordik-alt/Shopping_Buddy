import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const getDb = vi.fn()
const findFirst = vi.fn()
const resetHouseholdData = vi.fn()
const recordAudit = vi.fn()
const hitRateLimit = vi.fn()
vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/client', () => ({ getDb: () => getDb() }))
vi.mock('@/lib/db/data-reset', () => ({ resetHouseholdData: (...args: unknown[]) => resetHouseholdData(...args) }))
vi.mock('@/lib/db/audit', () => ({ recordAudit: (...args: unknown[]) => recordAudit(...args) }))
vi.mock('@/lib/db/rate-limit', () => ({ hitRateLimit: (...args: unknown[]) => hitRateLimit(...args) }))

import { POST } from '@/app/api/mobile/household-profile/reset-data/route'

const request = (body: unknown) => new Request('https://anitka.example/api/mobile/household-profile/reset-data', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('mobile household data reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'owner' })
    findFirst.mockResolvedValue({ name: 'Novákovi' })
    getDb.mockReturnValue({ query: { households: { findFirst } } })
    resetHouseholdData.mockResolvedValue({ photosFailed: 0 })
    recordAudit.mockResolvedValue(undefined)
    hitRateLimit.mockResolvedValue({ allowed: true })
  })

  it('resets selected groups after the owner confirms the household name', async () => {
    const response = await POST(request({ groups: ['shopping', 'shopping', 'pantry'], typedName: ' novákovi ' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, photosFailed: 0 })
    expect(resetHouseholdData).toHaveBeenCalledWith('household-1', ['shopping', 'pantry'])
    expect(recordAudit).toHaveBeenCalledWith({ householdId: 'household-1', memberId: 'member-1' }, 'data.reset', { groups: 'Nákupní seznamy, Zásoby' })
  })

  it('requires an owner and a matching confirmation before touching data', async () => {
    mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'member' })
    expect((await POST(request({ groups: ['shopping'], typedName: 'Novákovi' }))).status).toBe(403)
    mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'owner' })
    expect((await POST(request({ groups: ['shopping'], typedName: 'Novotní' }))).status).toBe(400)
    expect(resetHouseholdData).not.toHaveBeenCalled()
  })

  it('rejects an empty selection and enforces the reset rate limit', async () => {
    expect((await POST(request({ groups: ['unknown'], typedName: 'Novákovi' }))).status).toBe(400)
    hitRateLimit.mockResolvedValue({ allowed: false })
    expect((await POST(request({ groups: ['shopping'], typedName: 'Novákovi' }))).status).toBe(429)
    expect(resetHouseholdData).not.toHaveBeenCalled()
  })
})
