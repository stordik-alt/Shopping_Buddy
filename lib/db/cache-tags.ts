/** Cache tags for global catalog/price data. Keep these independent from cache implementation. */
export const GLOBAL_CACHE_TAGS = {
  products: 'global-products',
  stores: 'global-stores',
  storeChains: 'global-store-chains',
  standaloneOffers: 'global-standalone-offers',
  productPrices: 'global-product-prices',
  recipes: 'global-recipes',
} as const
