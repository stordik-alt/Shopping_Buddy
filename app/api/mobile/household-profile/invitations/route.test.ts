import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const getDb = vi.fn()
const findMany = vi.fn()
const values = vi.fn()
const returning = vi.fn()
const updateWhere = vi.fn()
const recordAudit = vi.fn()
const hitRateLimit = vi.fn()
vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/client', () => ({ getDb: () => getDb() }))
vi.mock('@/lib/db/audit', () => ({ recordAudit: (...args: unknown[]) => recordAudit(...args) }))
vi.mock('@/lib/db/rate-limit', () => ({ hitRateLimit: (...args: unknown[]) => hitRateLimit(...args) }))

import { GET, POST } from '@/app/api/mobile/household-profile/invitations/route'
import { DELETE } from '@/app/api/mobile/household-profile/invitations/[invitationId]/route'

const request = (method: string, body?: unknown, url = 'https://anitka.example/api/mobile/household-profile/invitations') => new Request(url, {
  method,
  headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

describe('mobile household invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'owner' })
    findMany.mockResolvedValue([{ id: 'invite-1', email: 'member@example.cz', expiresAt: new Date('2026-11-01T12:00:00.000Z') }])
    returning.mockResolvedValue([{ id: 'invite-2', email: 'member@example.cz', expiresAt: new Date('2026-11-01T12:00:00.000Z') }])
    values.mockReturnValue({ returning })
    updateWhere.mockResolvedValue(undefined)
    recordAudit.mockResolvedValue(undefined)
    hitRateLimit.mockResolvedValue({ allowed: true, hits: 1 })
    getDb.mockReturnValue({
      query: { invitations: { findMany: vi.fn(() => findMany()), findFirst: vi.fn().mockResolvedValue({ id: 'invite-1', status: 'pending' }) } },
      insert: vi.fn(() => ({ values })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: updateWhere })) })),
    })
  })

  it('lists household invitations and creates a shareable invite link for its owner', async () => {
    const listed = await GET(request('GET'))
    expect(listed.status).toBe(200)
    expect(await listed.json()).toMatchObject({ invitations: [{ id: 'invite-1', email: 'member@example.cz' }] })

    const created = await POST(request('POST', { email: 'Member@Example.cz' }))
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ invitation: { id: 'invite-2', email: 'member@example.cz' }, url: expect.stringMatching(/^https:\/\/anitka\.example\/invite\//) })
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ householdId: 'household-1', email: 'member@example.cz', invitedByMemberId: 'member-1' }))
    expect(recordAudit).toHaveBeenCalledWith({ householdId: 'household-1', memberId: 'member-1' }, 'invitation.created', {}, 'invite-2')
  })

  it('only lets owners create or revoke invitations and scopes revoke to the household', async () => {
    mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'member' })
    expect((await POST(request('POST', { email: 'member@example.cz' }))).status).toBe(403)
    expect((await DELETE(request('DELETE'), { params: Promise.resolve({ invitationId: 'invite-1' }) })).status).toBe(403)
    expect(getDb).not.toHaveBeenCalled()
  })

  it('validates addresses and respects the invitation rate limit', async () => {
    expect((await POST(request('POST', { email: 'not-an-email' }))).status).toBe(400)
    hitRateLimit.mockResolvedValue({ allowed: false, hits: 6 })
    expect((await POST(request('POST', { email: 'member@example.cz' }))).status).toBe(429)
    expect(values).not.toHaveBeenCalled()
  })

  it('revokes only a pending invitation from this household', async () => {
    const response = await DELETE(request('DELETE'), { params: Promise.resolve({ invitationId: 'invite-1' }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(recordAudit).toHaveBeenCalledWith({ householdId: 'household-1', memberId: 'member-1' }, 'invitation.revoked', {}, 'invite-1')
  })
})
