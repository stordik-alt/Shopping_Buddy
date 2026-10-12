import { describe, expect, it } from 'vitest'
import { authLimitFor, clientAddress } from '@/lib/auth-rate-limit'

describe('authLimitFor', () => {
  it('limits sign-up and sign-in posts only', () => {
    expect(authLimitFor('POST', '/api/auth/sign-up/email')).toMatchObject({ name: 'signup', max: 5 })
    expect(authLimitFor('POST', '/api/auth/sign-in/email')).toMatchObject({ name: 'signin' })
    expect(authLimitFor('GET', '/api/auth/sign-up/email')).toBeNull()
    expect(authLimitFor('POST', '/api/auth/get-session')).toBeNull()
    expect(authLimitFor('POST', '/api/auth/sign-out')).toBeNull()
  })
})

describe('clientAddress', () => {
  it('takes the first forwarded address, then x-real-ip, else null', () => {
    expect(clientAddress(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7')
    expect(clientAddress(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2')
    expect(clientAddress(new Headers())).toBeNull()
  })
})
