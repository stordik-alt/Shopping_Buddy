import { describe, expect, it, vi } from 'vitest'

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
