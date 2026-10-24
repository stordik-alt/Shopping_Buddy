import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const getDb = vi.fn()
const findFirst = vi.fn()
const values = vi.fn()
const onConflictDoUpdate = vi.fn()
const where = vi.fn()
vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/client', () => ({ getDb: () => getDb() }))

import { DELETE, GET, PUT } from '@/app/api/mobile/push-subscription/route'

const token = 'ExponentPushToken[abc-123_xyz]'
const request = (method: string, body?: unknown, query = '') => new Request(`https://anitka.example/api/mobile/push-subscription${query}`, {
  method,
  headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

describe('/api/mobile/push-subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'member' })
    findFirst.mockResolvedValue(null)
    values.mockReturnValue({ onConflictDoUpdate })
    onConflictDoUpdate.mockResolvedValue(undefined)
    where.mockResolvedValue(undefined)
    getDb.mockReturnValue({
      query: { pushSubscriptions: { findFirst } },
      insert: vi.fn(() => ({ values })),
      delete: vi.fn(() => ({ where })),
    })
  })

  it('registers, checks and removes only this member\'s Expo token', async () => {
    expect((await PUT(request('PUT', { token }))).status).toBe(200)
    expect(values).toHaveBeenCalledWith({ householdId: 'household-1', memberId: 'member-1', endpoint: `https://exp.host/--/api/v2/push/send?to=${encodeURIComponent(token)}`, p256dh: 'expo', auth: 'expo' })
    expect((await GET(request('GET', undefined, `?token=${encodeURIComponent(token)}`))).status).toBe(200)
    expect(findFirst).toHaveBeenCalledOnce()
    expect((await DELETE(request('DELETE', { token }))).status).toBe(200)
    expect(where).toHaveBeenCalledOnce()
  })

  it('rejects malformed push tokens before touching the database', async () => {
    expect((await PUT(request('PUT', { token: 'https://example.com' }))).status).toBe(400)
    expect((await GET(request('GET', undefined, '?token=nope'))).status).toBe(400)
    expect(getDb).not.toHaveBeenCalled()
  })
})
