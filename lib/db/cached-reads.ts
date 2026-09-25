import { unstable_cache } from 'next/cache'
import { getStoreChains } from '@/lib/db/member-store-preferences'
import { getProductPrices, getStandaloneOffers, getStores } from '@/lib/db/queries'
import { ingestionDate } from '@/lib/ingestion/today'

// Cached versions of the page's global reads — branches, chains, prices and promotions are the same
// for every household. The app re-renders the page on its periodic refresh (components/app-shell.tsx)
// and on every change; without a cache each render read all of this from Neon again, which used up
// the free plan's monthly network transfer (5 GB). Cached for 15 minutes in Next's data cache, so the
// refresh reads only the household's own data from the database. Prices and promotions change a few
// times a day (the ingestion crons), so 15 minutes of delay is harmless.
//
// `unstable_cache` is what this Next version still supports without switching the app to Cache
// Components (docs: node_modules/next/dist/docs/.../unstable_cache.md). A result it cannot store
// (over the data cache's item size limit) is simply not cached — the read still works. On the
// prepared Cloudflare build the incremental cache is read-only, so there these reads are uncached.

const FIFTEEN_MINUTES = 15 * 60

export const getStoresCached = unstable_cache(getStores, ['stores-v1'], { revalidate: FIFTEEN_MINUTES })

export const getStoreChainsCached = unstable_cache(getStoreChains, ['store-chains-v1'], { revalidate: FIFTEEN_MINUTES })

const standaloneOffersFor = unstable_cache((today: string) => getStandaloneOffers(today), ['standalone-offers-v1'], { revalidate: FIFTEEN_MINUTES })
/** Today's offers without a regular price; keyed by the date, so a new day never serves yesterday's. */
export const getStandaloneOffersCached = () => standaloneOffersFor(ingestionDate())

const productPricesFor = unstable_cache(
  (names: string[], runningDeals: boolean, _today: string) => getProductPrices({ names, runningDeals }),
  ['product-prices-v1'],
  { revalidate: FIFTEEN_MINUTES },
)
/** Prices of the listed products (and today's promotions). The names are sorted and de-duplicated so
 *  the same list in another order hits the same cache entry; the date keeps a new day's promotions
 *  from being served from yesterday's entry. */
export const getProductPricesCached = (scope: { names: string[]; runningDeals: boolean }) =>
  productPricesFor([...new Set(scope.names)].sort(), scope.runningDeals, ingestionDate())
