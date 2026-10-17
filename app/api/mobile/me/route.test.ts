import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
const findFirst = vi.fn()
vi.mock('@/lib/auth/server', () => ({ auth: { getSession: () => getSession() } }))
vi.mock('@/lib/db/client', () => ({ getDb: () => ({ query: { householdMembers: { findFirst } } }) }))

import { GET } from '@/app/api/mobile/me/route'

describe('GET /api/mobile/me', () => {
  beforeEach(() => vi.clearAllMocks())

  it('answers 401 JSON without a session', async () => {
    getSession.mockResolvedValue({ data: null })
    const response = await GET()
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('returns the session user and household, never treating a missing flag as verified', async () => {
    getSession.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.cz', name: 'A' } } })
    findFirst.mockResolvedValue({ householdId: 'h1', role: 'owner' })
    const body = await (await GET()).json()
    expect(body).toEqual({ user: { id: 'u1', email: 'a@b.cz', name: 'A', emailVerified: false }, household: { id: 'h1', role: 'owner' } })
  })

  it('returns a null household for a user without membership', async () => {
    getSession.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.cz', name: 'A', emailVerified: true } } })
    findFirst.mockResolvedValue(undefined)
    const body = await (await GET()).json()
    expect(body.household).toBeNull()
    expect(body.user.emailVerified).toBe(true)
  })
})
