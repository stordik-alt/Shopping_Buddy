import { unstable_cache } from 'next/cache'
import { getStoreChains } from '@/lib/db/member-store-preferences'
import { getProductPrices, getStandaloneOffers, getStores } from '@/lib/db/queries'
import { ingestionDate } from '@/lib/ingestion/today'
import { GLOBAL_CACHE_TAGS } from '@/lib/db/cache-tags'

// Cached versions of the page's global reads — branches, chains, prices and promotions are the same
// for every household. These data change at most daily, so the normal TTL is 24 hours. Price/deal
// ingestion explicitly invalidates the relevant tags after a successful import, while the date in
// the price/offer cache key also prevents yesterday's data from living into a new ingestion day.
//
// `unstable_cache` is what this Next version still supports without switching the app to Cache
// Components (docs: node_modules/next/dist/docs/.../unstable_cache.md). A result it cannot store
// (over the data cache's item size limit) is simply not cached — the read still works. On the
// prepared Cloudflare build the incremental cache is read-only, so there these reads are uncached.

const ONE_DAY = 24 * 60 * 60

export const getStoresCached = unstable_cache(getStores, ['stores-v2'], {
  revalidate: ONE_DAY,
  tags: [GLOBAL_CACHE_TAGS.stores],
})

export const getStoreChainsCached = unstable_cache(getStoreChains, ['store-chains-v2'], {
  revalidate: ONE_DAY,
  tags: [GLOBAL_CACHE_TAGS.storeChains],
})

const standaloneOffersFor = unstable_cache((today: string) => getStandaloneOffers(today), ['standalone-offers-v3'], {
  revalidate: ONE_DAY,
  tags: [GLOBAL_CACHE_TAGS.standaloneOffers],
})
/** Today's offers without a regular price; keyed by the date, so a new day never serves yesterday's. */
export const getStandaloneOffersCached = () => standaloneOffersFor(ingestionDate())

const productPricesFor = unstable_cache(
  (names: string[], runningDeals: boolean, _today: string) => getProductPrices({ names, runningDeals }),
  ['product-prices-v1'],
  { revalidate: ONE_DAY, tags: [GLOBAL_CACHE_TAGS.productPrices] },
)
/** Prices of the listed products (and today's promotions). The names are sorted and de-duplicated so
 *  the same list in another order hits the same cache entry; the date keeps a new day's promotions
 *  from being served from yesterday's entry. */
export const getProductPricesCached = (scope: { names: string[]; runningDeals: boolean }) =>
  productPricesFor([...new Set(scope.names)].sort(), scope.runningDeals, ingestionDate())
