import { describe, expect, it } from 'vitest'
import { poolMax, usesPgDriver } from '@/lib/db/local'

describe('usesPgDriver', () => {
  it('stays on the Neon driver for a Neon host by default', () => {
    expect(usesPgDriver('postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/db', {})).toBe(false)
    expect(usesPgDriver(undefined, {})).toBe(false)
  })
  it('uses pg for a loopback host', () => {
    expect(usesPgDriver('postgresql://u:p@localhost:5433/db', {})).toBe(true)
    expect(usesPgDriver('postgresql://u:p@127.0.0.1/db', {})).toBe(true)
  })
  it('uses pg for any host when DATABASE_DRIVER=pg', () => {
    expect(usesPgDriver('postgresql://u:p@db.example.com/db', { DATABASE_DRIVER: 'pg' })).toBe(true)
  })
  it('ignores other DATABASE_DRIVER values', () => {
    expect(usesPgDriver('postgresql://u:p@db.example.com/db', { DATABASE_DRIVER: 'neon' })).toBe(false)
  })
})

describe('poolMax', () => {
  it('defaults to 5 and accepts a positive integer', () => {
    expect(poolMax({})).toBe(5)
    expect(poolMax({ DATABASE_POOL_MAX: '12' })).toBe(12)
    expect(poolMax({ DATABASE_POOL_MAX: '0' })).toBe(5)
    expect(poolMax({ DATABASE_POOL_MAX: 'abc' })).toBe(5)
  })
})
