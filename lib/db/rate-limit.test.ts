import { eq, like } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import { hitRateLimit } from '@/lib/db/rate-limit'
import * as schema from '@/lib/db/schema'

const prefix = `__test_rate_limit_${crypto.randomUUID().slice(0, 8)}`

afterAll(async () => {
  await getDb().delete(schema.rateLimits).where(like(schema.rateLimits.key, `${prefix}%`))
})

describe('hitRateLimit', () => {
  it('allows up to the maximum in a window and refuses the rest', async () => {
    const key = `${prefix}:max`
    const results = []
    for (let i = 0; i < 5; i += 1) results.push((await hitRateLimit(key, { max: 3, windowMs: 60_000 })).allowed)
    expect(results).toEqual([true, true, true, false, false])
  })

  it('counts every key separately', async () => {
    expect((await hitRateLimit(`${prefix}:a`, { max: 1, windowMs: 60_000 })).allowed).toBe(true)
    expect((await hitRateLimit(`${prefix}:b`, { max: 1, windowMs: 60_000 })).allowed).toBe(true)
    expect((await hitRateLimit(`${prefix}:a`, { max: 1, windowMs: 60_000 })).allowed).toBe(false)
  })

  it('starts a new window once the old one has passed', async () => {
    const key = `${prefix}:reset`
    await hitRateLimit(key, { max: 1, windowMs: 60_000 })
    expect((await hitRateLimit(key, { max: 1, windowMs: 60_000 })).allowed).toBe(false)
    await getDb().update(schema.rateLimits).set({ windowStartedAt: new Date(Date.now() - 2 * 60_000) }).where(eq(schema.rateLimits.key, key))
    expect(await hitRateLimit(key, { max: 1, windowMs: 60_000 })).toEqual({ allowed: true, hits: 1 })
  })

  it('does not let concurrent requests slip past the limit', async () => {
    const key = `${prefix}:race`
    const results = await Promise.all(Array.from({ length: 8 }, () => hitRateLimit(key, { max: 3, windowMs: 60_000 })))
    expect(results.filter((result) => result.allowed)).toHaveLength(3)
  })
})
