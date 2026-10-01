import { revalidateTag } from 'next/cache'
import { GLOBAL_CACHE_TAGS } from '@/lib/db/cache-tags'

/** Marks global catalog/price reads stale after an ingestion or catalog mutation. */
export function invalidateProductPriceCache(): void {
  revalidateTag(GLOBAL_CACHE_TAGS.productPrices, 'max')
}

export function invalidatePriceAndOfferCaches(): void {
  invalidateProductPriceCache()
  revalidateTag(GLOBAL_CACHE_TAGS.standaloneOffers, 'max')
}

/** Marks store metadata stale after a store/branch import. */
export function invalidateStoreCaches(): void {
  revalidateTag(GLOBAL_CACHE_TAGS.stores, 'max')
  revalidateTag(GLOBAL_CACHE_TAGS.storeChains, 'max')
}
