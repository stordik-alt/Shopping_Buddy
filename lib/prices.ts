import type { ItemCategory, ItemUnit, StoreChain } from '@/lib/types'

export const TODAY = '2026-09-19'

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
  history: { date: string; price: number }[]
}

export const PRODUCT_PRICES: ProductPrice[] = [
  {
    productName: 'Mléko polotučné',
    category: 'Potraviny',
    prices: [
      { store: 'Lidl', regularPrice: 39.9, dealPrice: 29.9, dealValidUntil: '2026-09-26', unit: 'l', unitPrice: 29.9, recordedAt: TODAY },
      { store: 'Albert', regularPrice: 42.9, unit: 'l', unitPrice: 42.9, recordedAt: TODAY },
      { store: 'Kaufland', regularPrice: 37.9, unit: 'l', unitPrice: 37.9, recordedAt: TODAY },
      { store: 'Billa', regularPrice: 44.9, unit: 'l', unitPrice: 44.9, recordedAt: TODAY },
      { store: 'Penny', regularPrice: 38.9, unit: 'l', unitPrice: 38.9, recordedAt: TODAY },
    ],
    history: [
      { date: '2026-06-19', price: 36.9 },
      { date: '2026-07-19', price: 38.9 },
      { date: '2026-08-19', price: 39.9 },
      { date: '2026-09-19', price: 37.9 },
    ],
  },
  {
    productName: 'Kuřecí prsa',
    category: 'Potraviny',
    prices: [
      { store: 'Lidl', regularPrice: 149.9, unit: 'kg', unitPrice: 149.9, recordedAt: TODAY },
      { store: 'Albert', regularPrice: 199.9, dealPrice: 159.9, dealValidUntil: '2026-09-24', unit: 'kg', unitPrice: 159.9, recordedAt: TODAY },
      { store: 'Kaufland', regularPrice: 169.9, unit: 'kg', unitPrice: 169.9, recordedAt: TODAY },
      { store: 'Billa', regularPrice: 189.9, unit: 'kg', unitPrice: 189.9, recordedAt: TODAY },
    ],
    history: [
      { date: '2026-06-19', price: 179.9 },
      { date: '2026-07-19', price: 169.9 },
      { date: '2026-08-19', price: 189.9 },
      { date: '2026-09-19', price: 149.9 },
    ],
  },
  {
    productName: 'Banány',
    category: 'Potraviny',
    prices: [
      { store: 'Lidl', regularPrice: 32.9, unit: 'kg', unitPrice: 32.9, recordedAt: TODAY },
      { store: 'Albert', regularPrice: 34.9, unit: 'kg', unitPrice: 34.9, recordedAt: TODAY },
      { store: 'Kaufland', regularPrice: 29.9, unit: 'kg', unitPrice: 29.9, recordedAt: TODAY },
      { store: 'Penny', regularPrice: 33.9, unit: 'kg', unitPrice: 33.9, recordedAt: TODAY },
    ],
    history: [
      { date: '2026-07-19', price: 31.9 },
      { date: '2026-08-19', price: 33.9 },
      { date: '2026-09-19', price: 29.9 },
    ],
  },
  {
    productName: 'Toaletní papír',
    category: 'Drogerie',
    prices: [
      { store: 'Kaufland', regularPrice: 79.9, dealPrice: 64.9, dealValidUntil: '2026-09-30', unit: 'ks', unitPrice: 8.1, recordedAt: TODAY },
      { store: 'Lidl', regularPrice: 74.9, unit: 'ks', unitPrice: 9.4, recordedAt: TODAY },
      { store: 'Billa', regularPrice: 84.9, unit: 'ks', unitPrice: 10.6, recordedAt: TODAY },
      { store: 'Penny', regularPrice: 76.9, unit: 'ks', unitPrice: 9.6, recordedAt: TODAY },
    ],
    history: [
      { date: '2026-07-19', price: 78.9 },
      { date: '2026-08-19', price: 79.9 },
      { date: '2026-09-19', price: 74.9 },
    ],
  },
]

export function effectivePrice(price: PricePoint) {
  return price.dealPrice ?? price.regularPrice
}

export function isDealActive(price: PricePoint, referenceDate = TODAY) {
  return price.dealPrice != null && (price.dealValidUntil == null || price.dealValidUntil >= referenceDate)
}

export function comparePrices(productName: string) {
  const product = PRODUCT_PRICES.find((entry) => entry.productName === productName)
  if (!product) return null
  const sorted = [...product.prices].sort((a, b) => effectivePrice(a) - effectivePrice(b))
  return { ...product, prices: sorted }
}

export function cheapestPrice(product: ProductPrice) {
  return [...product.prices].sort((a, b) => effectivePrice(a) - effectivePrice(b))[0]
}

export function activeDeals(referenceDate = TODAY) {
  return PRODUCT_PRICES.flatMap((product) =>
    product.prices.filter((price) => isDealActive(price, referenceDate)).map((price) => ({ product, price })),
  )
}

export function priceRangeLast3Months(product: ProductPrice) {
  const values = product.history.map((entry) => entry.price)
  return { min: Math.min(...values), max: Math.max(...values) }
}
