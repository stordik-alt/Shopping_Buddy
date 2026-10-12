import { describe, expect, it } from 'vitest'
import { buildCsp, cspHeaderName, newNonce } from '@/lib/csp'

describe('buildCsp', () => {
  it('allows scripts only with the request nonce, and no inline or eval scripts in production', () => {
    const policy = buildCsp('abc', { isDev: false })
    expect(policy).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'")
    expect(policy).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/)
  })
  it('allows eval for scripts only in development', () => {
    expect(buildCsp('abc', { isDev: true })).toMatch(/script-src[^;]*'unsafe-eval'/)
  })
  it('forbids framing, plugins and foreign base/form targets', () => {
    const policy = buildCsp('abc', { isDev: false })
    for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) expect(policy).toContain(directive)
  })
})

describe('cspHeaderName / newNonce', () => {
  it('reports only until enforcement is switched on', () => {
    expect(cspHeaderName(false)).toBe('Content-Security-Policy-Report-Only')
    expect(cspHeaderName(true)).toBe('Content-Security-Policy')
  })
  it('gives a different nonce each time', () => {
    expect(newNonce()).not.toBe(newNonce())
  })
})
