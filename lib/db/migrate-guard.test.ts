import { describe, expect, it } from 'vitest'
import { deployMigrationDecision } from '@/lib/db/migrate-guard'

describe('deployMigrationDecision', () => {
  it('migrates on a Vercel production build', () => {
    expect(deployMigrationDecision({ VERCEL: '1', VERCEL_ENV: 'production' })).toEqual({ migrate: true })
  })

  it('never touches the database from a preview, CI, a local or a Cloudflare build', () => {
    expect(deployMigrationDecision({ VERCEL: '1', VERCEL_ENV: 'preview' })).toEqual({ migrate: false, reason: 'a preview deployment, not production' })
    expect(deployMigrationDecision({ VERCEL: '1', VERCEL_ENV: 'development' }).migrate).toBe(false)
    expect(deployMigrationDecision({ CI: 'true' })).toEqual({ migrate: false, reason: 'not a Vercel build (local, CI or Cloudflare)' })
    expect(deployMigrationDecision({ BUILD_TARGET: 'cloudflare', VERCEL_ENV: 'production' }).migrate).toBe(false)
  })

  it('stops a Vercel build that cannot tell production from a preview', () => {
    expect(() => deployMigrationDecision({ VERCEL: '1' })).toThrow('VERCEL_ENV is not set')
  })
})
