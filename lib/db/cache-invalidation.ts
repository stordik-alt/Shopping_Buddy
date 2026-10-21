import { revalidateTag } from 'next/cache'
import { GLOBAL_CACHE_TAGS } from '@/lib/db/cache-tags'

// Marks global catalog/price reads stale after an ingestion or catalog mutation.
//
// The Next data cache only exists inside a Next request (a Server Action, a Route Handler). Outside
// one, `revalidateTag` throws "Invariant: static generation store missing" (Next's error code E263)
// — and the scripts that import prices by hand (`pnpm db:albert-flyers --apply` and its siblings)
// run in a plain Node process, where there is no cache to invalidate at all.
//
// So the invalidation must never be the reason a run fails. A run that has already written prices
// and then dies on the invalidation would leave the import half-done and skip the rest of its
// bookkeeping (the external refs' last-seen update in lib/ingestion/ingest.ts). A missing cache is
// not an error: the catalog cache belongs to the deployment that serves the app, and a script's own
// process has none. The app's cache expires on its own within a day (the cached reads carry a
// one-day `revalidate`), and the next cron invalidates it properly.
//
// Only that one known case is swallowed. Every other failure is re-thrown, so a real problem is
// never hidden (CLAUDE.md section 26).

/** Next's error code for "revalidateTag was called where there is no static generation store" —
 *  i.e. outside a Next request. See node_modules/next/dist/.../spec-extension/revalidate.ts. */
const NO_CACHE_STORE_ERROR_CODE = 'E263'

/** True when the error is Next's "no static generation store" — there is no cache to invalidate. */
function isNoCacheStoreError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { __NEXT_ERROR_CODE?: unknown }).__NEXT_ERROR_CODE === NO_CACHE_STORE_ERROR_CODE
}

/** Invalidates one tag. Returns false when there was no cache to invalidate (outside a Next
 *  request — a script, not a cron); any other failure is thrown, not hidden. */
function invalidateTagSafely(tag: string): boolean {
  try {
    revalidateTag(tag, 'max')
    return true
  } catch (error) {
    if (isNoCacheStoreError(error)) return false
    throw error
  }
}

/** Marks global catalog/price reads stale after an ingestion or catalog mutation. */
export function invalidateProductCatalogCache(): void {
  invalidateTagSafely(GLOBAL_CACHE_TAGS.products)
}

export function invalidateProductPriceCache(): void {
  invalidateTagSafely(GLOBAL_CACHE_TAGS.productPrices)
}

export function invalidateDealsCache(): void {
  invalidateTagSafely(GLOBAL_CACHE_TAGS.deals)
}

export function invalidatePriceAndOfferCaches(): void {
  invalidateProductPriceCache()
  invalidateTagSafely(GLOBAL_CACHE_TAGS.standaloneOffers)
}

/** Marks recipe catalog reads stale after the daily recipe import. */
export function invalidateRecipeCaches(): void {
  invalidateTagSafely(GLOBAL_CACHE_TAGS.recipes)
}

/** Marks store metadata stale after a store/branch import. */
export function invalidateStoreCaches(): void {
  invalidateTagSafely(GLOBAL_CACHE_TAGS.stores)
  invalidateTagSafely(GLOBAL_CACHE_TAGS.storeChains)
}
