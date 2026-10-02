import { unstable_cache } from 'next/cache'
import { getStoreChains } from '@/lib/db/member-store-preferences'
import { getProductCatalog, getProductPrices, getStandaloneOffers, getStores, getSubcategoryCatalog } from '@/lib/db/queries'
import type { ProductCatalogEntry } from '@/lib/products'
import { normalizeSearchText } from '@/lib/product-search'
import type { ItemCategory } from '@/lib/types'
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


const CATALOG_BUCKETS = [...'abcdefghijklmnopqrstuvwxyz', 'other'] as const

const productCatalogByNames = unstable_cache(
  (names: string[]) => getProductCatalog(names),
  ['product-catalog-by-names-v1'],
  { revalidate: ONE_DAY, tags: [GLOBAL_CACHE_TAGS.products] },
)

const productCatalogBucket = unstable_cache(
  (bucket: string) => {
    return getProductCatalogByPrefix(bucket)
  },
  ['product-catalog-bucket-v1'],
  { revalidate: ONE_DAY, tags: [GLOBAL_CACHE_TAGS.products] },
)

async function getProductCatalogByPrefix(prefix: string): Promise<ProductCatalogEntry[]> {
  // Prefix reads stay bounded and individually cacheable; the complete catalog is too large for one
  // Next Data Cache item. The query uses the same normalized search_name column as name matching.
  const db = (await import('@/lib/db/client')).getDb()
  const { sql } = await import('drizzle-orm')
  const schema = await import('@/lib/db/schema')
  const products = await db.query.products.findMany({
    columns: { id: true, name: true, defaultUnit: true, defaultLocation: true, isChildOriented: true, isNonInventory: true },
    with: { category: { columns: { name: true } }, subcategory: { columns: { name: true } } },
    where: prefix === 'other' ? sql`${schema.products.searchName} !~ '^[a-z]'` : sql`${schema.products.searchName} LIKE ${`${prefix}%`}`,
  })
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category.name as ItemCategory,
    defaultUnit: product.defaultUnit,
    defaultLocation: product.defaultLocation,
    subcategory: product.subcategory?.name ?? null,
    isChildOriented: product.isChildOriented,
    isNonInventory: product.isNonInventory,
  }))
}

/** Candidate lookup for one or more names. Identical normalized input reuses the same global cache entry. */
export const getProductCatalogCached = async (names?: string[]): Promise<ProductCatalogEntry[]> => {
  if (names && names.length === 0) return []
  if (names) {
    const normalized = [...new Set(names.map((name) => normalizeSearchText(name.trim())))].sort()
    return productCatalogByNames(normalized)
  }

  // The catalog is split into small, independently cacheable prefix buckets instead of one large
  // cache value. A cache miss therefore loads each bucket once; subsequent requests do not query Neon.
  const buckets = await Promise.all(CATALOG_BUCKETS.map((bucket) => productCatalogBucket(bucket)))
  return buckets.flat()
}

/** Fixed subcategories (~35 rows), cached globally because they are shared by every household. */
export const getSubcategoryCatalogCached = unstable_cache(
  getSubcategoryCatalog,
  ['product-subcategories-v1'],
  { revalidate: ONE_DAY, tags: [GLOBAL_CACHE_TAGS.products] },
)
