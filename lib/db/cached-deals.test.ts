import { beforeEach, describe, expect, it, vi } from 'vitest'

// docs/35_SECURITY_AUDIT.md, S23: a household's preferred / excluded products must not become part of the
// shared Next Data Cache's keys. `unstable_cache` is replaced by a spy-able pass-through, so the test can
// see which calls would have gone through the cache.
const cachedCalls: unknown[][] = []
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: any[]) => any) => (...args: unknown[]) => {
    cachedCalls.push(args)
    return fn(...args)
  },
}))
const { getDealsPage } = vi.hoisted(() => ({ getDealsPage: vi.fn(async () => ({ deals: [], offers: [], total: 0 })) }))
vi.mock('@/lib/db/deals', () => ({ getDealsPage }))

const base = { category: 'all' as never, chain: null, sort: 'discount' as never, page: 1, query: null }

describe('getDealsPageCached', () => {
  beforeEach(() => {
    cachedCalls.length = 0
    getDealsPage.mockClear()
  })

  it('caches a page that is the same for every household', async () => {
    const { getDealsPageCached } = await import('@/lib/db/cached-reads')
    await getDealsPageCached({ ...base, preferred: null, excluded: [] })
    expect(cachedCalls).toHaveLength(1)
    expect(getDealsPage).toHaveBeenCalledTimes(1)
  })

  it('does not put a household\'s preferred or excluded terms into the cache', async () => {
    const { getDealsPageCached } = await import('@/lib/db/cached-reads')
    await getDealsPageCached({ ...base, preferred: ['jogurt'], excluded: [] })
    await getDealsPageCached({ ...base, preferred: null, excluded: ['ořechy'] })
    expect(cachedCalls).toHaveLength(0)
    expect(getDealsPage).toHaveBeenCalledTimes(2)
  })
})
