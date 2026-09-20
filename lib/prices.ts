import type { ItemCategory, ItemUnit, StoreChain } from '@/lib/types'

export type PricePoint = {
  store: StoreChain
  regularPrice: number
  dealPrice?: number
  dealValidUntil?: string
  unit: ItemUnit
  unitPrice: number
  recordedAt: string
}

export type ProductPrice = {
  productName: string
  category: ItemCategory
  prices: PricePoint[]
}

export function effectivePrice(price: PricePoint) {
  return price.dealPrice ?? price.regularPrice
}

export function isDealActive(price: PricePoint, referenceDate: string) {
  return price.dealPrice != null && (price.dealValidUntil == null || price.dealValidUntil >= referenceDate)
}

/** Prices for one product across stores, cheapest (effective price) first. */
export function comparePrices(products: ProductPrice[], productName: string) {
  const product = products.find((entry) => entry.productName === productName)
  if (!product) return null
  return { ...product, prices: [...product.prices].sort((a, b) => effectivePrice(a) - effectivePrice(b)) }
}

export function activeDeals(products: ProductPrice[], referenceDate: string) {
  return products.flatMap((product) =>
    product.prices.filter((price) => isDealActive(price, referenceDate)).map((price) => ({ product, price })),
  )
}
