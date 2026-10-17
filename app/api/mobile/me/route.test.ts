import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
const findFirst = vi.fn()
const requireBearerUser = vi.fn()
vi.mock('@/lib/auth/bearer', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/bearer')>()), requireBearerUser: (...a: unknown[]) => requireBearerUser(...a) }))
vi.mock('@/lib/auth/server', () => ({ auth: { getSession: () => getSession() } }))
vi.mock('@/lib/db/client', () => ({ getDb: () => ({ query: { householdMembers: { findFirst } } }) }))

import { GET } from '@/app/api/mobile/me/route'

const req = (authorization?: string) => new Request('https://x.test/api/mobile/me', { headers: authorization ? { authorization } : {} })

describe('GET /api/mobile/me', () => {
  beforeEach(() => vi.clearAllMocks())

  it('answers 401 JSON without a session', async () => {
    getSession.mockResolvedValue({ data: null })
    const response = await GET(req())
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('returns the session user and household, never treating a missing flag as verified', async () => {
    getSession.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.cz', name: 'A' } } })
    findFirst.mockResolvedValue({ householdId: 'h1', role: 'owner' })
    const body = await (await GET(req())).json()
    expect(body).toEqual({ user: { id: 'u1', email: 'a@b.cz', name: 'A', emailVerified: false }, household: { id: 'h1', role: 'owner' } })
  })

  it('returns a null household for a user without membership', async () => {
    getSession.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.cz', name: 'A', emailVerified: true } } })
    findFirst.mockResolvedValue(undefined)
    const body = await (await GET(req())).json()
    expect(body.household).toBeNull()
    expect(body.user.emailVerified).toBe(true)
  })

  it('uses a valid Bearer token and ignores the cookie session', async () => {
    requireBearerUser.mockResolvedValue({ id: 'u2', email: 'b@b.cz', name: 'B', emailVerified: true })
    findFirst.mockResolvedValue({ householdId: 'h2', role: 'member' })
    const body = await (await GET(req('Bearer tok'))).json()
    expect(getSession).not.toHaveBeenCalled()
    expect(body.user.id).toBe('u2')
    expect(body.household).toEqual({ id: 'h2', role: 'member' })
  })

  it.each([
    ['invalid', 401, 'invalid_token'],
    ['unavailable', 401, 'bearer_unavailable'],
    ['unverified_email', 403, 'email_not_verified'],
  ] as const)('refuses a Bearer token rejected as %s without falling back to the cookie', async (reason, status, code) => {
    const { BearerAuthError } = await import('@/lib/auth/bearer')
    requireBearerUser.mockRejectedValue(new BearerAuthError(reason, 'x'))
    getSession.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.cz', name: 'A', emailVerified: true } } })
    const response = await GET(req('Bearer tok'))
    expect(response.status).toBe(status)
    expect((await response.json()).error).toBe(code)
    expect(getSession).not.toHaveBeenCalled()
    expect(findFirst).not.toHaveBeenCalled()
  })
})
