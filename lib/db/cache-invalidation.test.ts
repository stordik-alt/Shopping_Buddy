import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// The cache invalidation decides whether a price-import run can finish. Outside a Next request
// (a script, not a cron) there is no data cache to invalidate, and Next's revalidateTag throws
// "Invariant: static generation store missing" (error code E263). That must not end a run that has
// already written its prices — the rest of the run's bookkeeping still has to happen.
//
// Every other failure must still surface: a real problem is never hidden (CLAUDE.md section 26).

const revalidateTag = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ revalidateTag }))

import {
  invalidateDealsCache,
  invalidatePriceAndOfferCaches,
  invalidateProductCatalogCache,
  invalidateProductPriceCache,
  invalidateRecipeCaches,
  invalidateStoreCaches,
} from '@/lib/db/cache-invalidation'

/** Next's own error for "called where there is no static generation store". */
function noCacheStoreError(): Error {
  return Object.defineProperty(new Error('Invariant: static generation store missing in revalidateTag x'), '__NEXT_ERROR_CODE', {
    value: 'E263',
    enumerable: false,
    configurable: true,
  })
}

beforeEach(() => {
  revalidateTag.mockReset()
})

afterEach(() => {
  revalidateTag.mockReset()
})

describe('cache invalidation outside a Next request', () => {
  it('does not throw when Next reports there is no static generation store', () => {
    // A script (`pnpm db:albert-flyers --apply`) runs in a plain Node process: there is no cache
    // to invalidate, and the import must still finish.
    revalidateTag.mockImplementation(() => {
      throw noCacheStoreError()
    })

    expect(() => invalidateProductCatalogCache()).not.toThrow()
    expect(() => invalidateProductPriceCache()).not.toThrow()
    expect(() => invalidateDealsCache()).not.toThrow()
    expect(() => invalidateRecipeCaches()).not.toThrow()
    expect(() => invalidateStoreCaches()).not.toThrow()
  })

  it('still invalidates the tags it can', () => {
    revalidateTag.mockImplementation(() => {
      throw noCacheStoreError()
    })

    invalidatePriceAndOfferCaches()

    expect(revalidateTag).toHaveBeenCalledWith('global-product-prices', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('global-standalone-offers', 'max')
  })
})

describe('cache invalidation inside a Next request', () => {
  it('invalidates the tag', () => {
    invalidateProductCatalogCache()

    expect(revalidateTag).toHaveBeenCalledWith('global-products', 'max')
  })

  it('invalidates the stores and chains tags together', () => {
    invalidateStoreCaches()

    expect(revalidateTag).toHaveBeenCalledWith('global-stores', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('global-store-chains', 'max')
  })
})

describe('a real failure is not hidden', () => {
  it('re-throws any other error', () => {
    revalidateTag.mockImplementation(() => {
      throw new Error('the cache backend is unreachable')
    })

    expect(() => invalidateProductCatalogCache()).toThrow('the cache backend is unreachable')
  })

  it('re-throws an error that only looks similar', () => {
    // Same message, different error code: not Next's "no cache" case, so it must surface.
    revalidateTag.mockImplementation(() => {
      throw Object.defineProperty(new Error('Invariant: static generation store missing in revalidateTag x'), '__NEXT_ERROR_CODE', {
        value: 'E999',
        enumerable: false,
        configurable: true,
      })
    })

    expect(() => invalidateProductCatalogCache()).toThrow('static generation store missing')
  })
})
