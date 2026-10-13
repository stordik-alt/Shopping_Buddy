import { describe, expect, it } from 'vitest'
import { LOCAL_MIN_PASSWORD_LENGTH, localAuthSettings } from '@/lib/auth/local-config'

describe('localAuthSettings', () => {
  it('asks for a password policy and switches the rate limit on', () => {
    const settings = localAuthSettings({ DATABASE_URL: 'postgresql://u:p@localhost:5433/db' })
    expect(settings.emailAndPassword.minPasswordLength).toBe(LOCAL_MIN_PASSWORD_LENGTH)
    expect(settings.rateLimit.enabled).toBe(true)
  })

  it('takes the origin from the request on a loopback database (no fixed origin)', () => {
    const settings = localAuthSettings({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:5433/db' })
    expect(settings.baseURL).toBeUndefined()
    expect(settings.trustedOrigins).toBeUndefined()
  })

  it('trusts only the configured public origin', () => {
    const settings = localAuthSettings({ DATABASE_URL: 'postgresql://u:p@db.example.com/db', DATABASE_DRIVER: 'pg', BETTER_AUTH_URL: 'https://anitka.example.com/some/path' })
    expect(settings.baseURL).toBe('https://anitka.example.com/some/path')
    expect(settings.trustedOrigins).toEqual(['https://anitka.example.com'])
  })

  it('refuses to start against a remote database without a fixed public address', () => {
    expect(() => localAuthSettings({ DATABASE_URL: 'postgresql://u:p@db.example.com/db', DATABASE_DRIVER: 'pg' })).toThrow('BETTER_AUTH_URL')
    expect(() => localAuthSettings({ DATABASE_DRIVER: 'pg' })).toThrow('BETTER_AUTH_URL')
  })
})
