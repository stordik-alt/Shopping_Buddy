import { describe, expect, it, vi } from 'vitest'
import { checkInviteRateLimit } from '@/lib/rate-limit'

vi.mock('@/lib/auth/server', () => ({
  auth: { middleware: () => () => null },
}))

import { isPublicRoute } from './proxy'

describe('isPublicRoute', () => {
  it.each([
    ['/', true],
    ['/intro', true],
    ['/intro/landing', true],
    ['/auth/sign-in', true],
    ['/invite/abc', true],
    ['/brand/logo.png', true],
    ['/manifest.webmanifest', true],
    ['/sw.js', true],
    ['/api/health', true],
    ['/api/auth/callback', true],
    ['/household', false],
    ['/api/cron/ingest-prices', false],
    ['/api/receipts/upload', false],
  ])('routes %s to %s', (pathname, expected) => {
    expect(isPublicRoute(pathname)).toBe(expected)
  })
})

describe('checkInviteRateLimit', () => {
  it('blocks too many invite attempts in a short window', () => {
    const key = 'rate-limit:test-user'

    for (let i = 0; i < 5; i++) {
      expect(() => checkInviteRateLimit(key, 5, 60_000)).not.toThrow()
    }

    expect(() => checkInviteRateLimit(key, 5, 60_000)).toThrow('Příliš mnoho pozvánek')
  })
})

