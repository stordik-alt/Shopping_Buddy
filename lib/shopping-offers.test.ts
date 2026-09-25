import { describe, expect, it } from 'vitest'
import { costForNeed, packageSize, pickAutoHit } from '@/lib/shopping-offers'
import type { ProductSearchHit } from '@/lib/product-search'

const hit = (overrides: Partial<ProductSearchHit> = {}): ProductSearchHit => ({
  productId: 'p1',
  name: 'Mléko polotučné',
  category: 'Potraviny',
  storeId: 'lidl',
  chain: 'Lidl',
  regularPrice: 30,
  dealPrice: null,
  dealValidUntil: null,
  unit: 'l',
  unitPrice: 30,
  observedAt: '2026-09-24',
  score: 5,
  direct: true,
  ...overrides,
})

describe('packageSize', () => {
  it('is the regular price divided by the unit price, in the comparable unit', () => {
    expect(packageSize(hit({ regularPrice: 45, unitPrice: 30, unit: 'l' }))).toEqual({ value: 1.5, unit: 'l' })
    expect(packageSize(hit({ regularPrice: 39.9, unitPrice: 159.6, unit: 'kg' }))).toEqual({ value: 0.25, unit: 'kg' })
  })

  it('is null for a piece-priced product or a zero unit price', () => {
    expect(packageSize(hit({ unit: 'ks' }))).toBeNull()
    expect(packageSize(hit({ unitPrice: 0 }))).toBeNull()
  })
})

describe('costForNeed', () => {
  it('prices a volume need pro rata by the price per litre', () => {
    // 1,5 l pack at 45 Kč = 30 Kč/l; 2 l of milk = 60 Kč whatever the pack size.
    expect(costForNeed({ quantity: 2, unit: 'l' }, hit({ regularPrice: 45, unitPrice: 30 }))).toEqual({ cost: 60, basis: 'per-unit' })
  })

  it('converts millilitres and grams', () => {
    expect(costForNeed({ quantity: 500, unit: 'ml' }, hit({ unitPrice: 30 }))).toEqual({ cost: 15, basis: 'per-unit' })
    expect(costForNeed({ quantity: 250, unit: 'g' }, hit({ unit: 'kg', unitPrice: 160 }))).toEqual({ cost: 40, basis: 'per-unit' })
    expect(costForNeed({ quantity: 2, unit: 'kg' }, hit({ unit: 'kg', unitPrice: 160 }))).toEqual({ cost: 320, basis: 'per-unit' })
  })

  it('uses the promotional price, scaling the unit price with it', () => {
    // Regular 30 Kč/l, on promotion at 20 Kč instead of 30 Kč per pack -> 20 Kč/l.
    expect(costForNeed({ quantity: 3, unit: 'l' }, hit({ regularPrice: 30, dealPrice: 20, unitPrice: 30 }))).toEqual({ cost: 60, basis: 'per-unit' })
  })

  it('prices a count of pieces as that many packages at the package price', () => {
    expect(costForNeed({ quantity: 3, unit: 'ks' }, hit({ regularPrice: 24.9, unitPrice: 24.9 }))).toEqual({ cost: 74.7, basis: 'per-package' })
    expect(costForNeed({ quantity: 2, unit: 'ks' }, hit({ regularPrice: 30, dealPrice: 22.9 }))).toEqual({ cost: 45.8, basis: 'per-package' })
  })

  it('cannot compare a weight need with a volume or piece product, or the reverse', () => {
    expect(costForNeed({ quantity: 1, unit: 'kg' }, hit({ unit: 'l' }))).toBeNull()
    expect(costForNeed({ quantity: 1, unit: 'kg' }, hit({ unit: 'ks' }))).toBeNull()
    expect(costForNeed({ quantity: 1, unit: 'l' }, hit({ unit: 'kg' }))).toBeNull()
    expect(costForNeed({ quantity: 1, unit: 'l' }, hit({ unit: 'ks' }))).toBeNull()
  })

  it('rejects a quantity that is not a positive number', () => {
    for (const quantity of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(costForNeed({ quantity, unit: 'ks' }, hit())).toBeNull()
    }
  })

  it('rounds to whole haléře', () => {
    expect(costForNeed({ quantity: 1, unit: 'l' }, hit({ unitPrice: 19.996 }))?.cost).toBe(20)
  })
})

describe('pickAutoHit', () => {
  const need = { quantity: 1, unit: 'l' as const }

  it('takes the best text match', () => {
    const exact = hit({ productId: 'a', name: 'Mléko polotučné', score: 12, unitPrice: 30 })
    const other = hit({ productId: 'b', name: 'Trvanlivé mléko', score: 5, unitPrice: 12 })
    expect(pickAutoHit(need, [other, exact])?.hit.productId).toBe('a')
  })

  it('among equal matches takes the cheapest for the need', () => {
    const dear = hit({ productId: 'a', score: 5, unitPrice: 30 })
    const cheap = hit({ productId: 'b', name: 'Mléko B', score: 5, unitPrice: 20 })
    expect(pickAutoHit(need, [dear, cheap])?.hit.productId).toBe('b')
  })

  it('skips a product that cannot be priced for the need', () => {
    const piece = hit({ productId: 'a', unit: 'ks', score: 9 })
    const litre = hit({ productId: 'b', unit: 'l', score: 5 })
    expect(pickAutoHit(need, [piece, litre])?.hit.productId).toBe('b')
  })

  it('never offers a product that only contains the item (regression: "Vejce" → a soup with egg)', () => {
    const eggs = { quantity: 10, unit: 'ks' as const }
    const soup = hit({ productId: 'soup', name: 'Polévka hovězí s vejcem', unit: 'ks', score: 3, direct: false, unitPrice: 25, regularPrice: 25 })
    const realEggs = hit({ productId: 'eggs', name: 'Vejce M 10 ks', unit: 'ks', score: 106, unitPrice: 4, regularPrice: 40 })
    expect(pickAutoHit(eggs, [soup, realEggs])?.hit.productId).toBe('eggs')
    // A chain that has only the soup offers nothing for eggs, rather than the soup.
    expect(pickAutoHit(eggs, [soup])).toBeNull()
  })

  it('is null when nothing can be priced', () => {
    expect(pickAutoHit(need, [hit({ unit: 'ks' })])).toBeNull()
    expect(pickAutoHit(need, [])).toBeNull()
  })

  it('is stable: the same choice whatever the order of hits', () => {
    const a = hit({ productId: 'a', name: 'Mléko A', score: 5, unitPrice: 20 })
    const b = hit({ productId: 'b', name: 'Mléko B', score: 5, unitPrice: 20 })
    expect(pickAutoHit(need, [a, b])?.hit.productId).toBe(pickAutoHit(need, [b, a])?.hit.productId)
  })
})
