import { describe, expect, it } from 'vitest'
import { costForNeed, packageSize, pickAutoHit, pickTypedHit } from '@/lib/shopping-offers'
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
  dealUnitPrice: null,
  unit: 'l',
  unitPrice: 30,
  observedAt: '2026-09-24',
  score: 5,
  direct: true,
  ...overrides,
})

/** A hit the app knows only from a running offer: no regular price, so the offer's own price and unit
 *  price are all it states (an offers-only retailer such as Penny). One price pair, so its unit price
 *  is also the promotion's own unless the test says otherwise. */
const offerHit = (overrides: Partial<ProductSearchHit> = {}): ProductSearchHit => {
  const stated: Partial<ProductSearchHit> = { regularPrice: null, dealPrice: 39.9, unitPrice: 39.9, unit: 'ks', observedAt: null, ...overrides }
  return hit({ ...stated, dealUnitPrice: overrides.dealUnitPrice ?? stated.unitPrice ?? null })
}

describe('packageSize', () => {
  it('is the regular price divided by the unit price, in the comparable unit', () => {
    expect(packageSize(hit({ regularPrice: 45, unitPrice: 30, unit: 'l' }))).toEqual({ value: 1.5, unit: 'l' })
    expect(packageSize(hit({ regularPrice: 39.9, unitPrice: 159.6, unit: 'kg' }))).toEqual({ value: 0.25, unit: 'kg' })
  })

  it('prefers the persistent catalog size when it is present', () => {
    expect(packageSize(hit({
      regularPrice: 39.9,
      unitPrice: 159.6,
      unit: 'kg',
      packageSize: { quantity: 0.25, unit: 'kg', label: '250 g', source: 'catalog' },
    }))).toEqual({ value: 0.25, unit: 'kg' })
  })

  it('uses explicit piece package evidence', () => {
    expect(packageSize(hit({
      unit: 'ks',
      packageSize: { quantity: 10, unit: 'ks', label: '10 ks', source: 'name-extracted' },
    }))).toEqual({ value: 10, unit: 'ks' })
  })

  it('is null for a piece-priced product without package evidence or a zero unit price', () => {
    expect(packageSize(hit({ unit: 'ks' }))).toBeNull()
    expect(packageSize(hit({ unitPrice: 0 }))).toBeNull()
  })

  it('uses an offer\'s own price pair when the app knows no regular price', () => {
    // Penny's "Máslo 250 g" at 39,90 Kč, printed as 159,60 Kč/kg: the offer describes the same package.
    expect(packageSize(offerHit({ dealPrice: 39.9, unitPrice: 159.6, unit: 'kg' }))).toEqual({ value: 0.25, unit: 'kg' })
  })

  it('is null for an offer that states no unit price — how big it is is not known', () => {
    expect(packageSize(offerHit({ unitPrice: null, unit: null }))).toBeNull()
  })
})

describe('costForNeed', () => {
  it('buys whole packages for a volume need', () => {
    // 1,5 l pack at 45 Kč; 2 l needs two packages.
    expect(costForNeed({ quantity: 2, unit: 'l' }, hit({ regularPrice: 45, unitPrice: 30 }))).toEqual({ cost: 90, basis: 'per-package', packages: 2 })
  })

  it('converts millilitres and grams and never charges less than one package', () => {
    expect(costForNeed({ quantity: 500, unit: 'ml' }, hit({ regularPrice: 45, unitPrice: 30 }))).toEqual({ cost: 45, basis: 'per-package', packages: 1 })
    expect(costForNeed({ quantity: 1, unit: 'g' }, hit({ regularPrice: 40, unit: 'kg', unitPrice: 160 }))).toEqual({ cost: 40, basis: 'per-package', packages: 1 })
    expect(costForNeed({ quantity: 500, unit: 'g' }, hit({ regularPrice: 40, unit: 'kg', unitPrice: 160 }))).toEqual({ cost: 80, basis: 'per-package', packages: 2 })
    expect(costForNeed({ quantity: 2, unit: 'kg' }, hit({ regularPrice: 40, unit: 'kg', unitPrice: 160 }))).toEqual({ cost: 320, basis: 'per-package', packages: 8 })
  })

  it('uses the promotional package price when buying whole packages', () => {
    // 1 l pack at 30 Kč, on promotion for 20 Kč; 3 l needs three packages.
    expect(costForNeed({ quantity: 3, unit: 'l' }, hit({ regularPrice: 30, dealPrice: 20, unitPrice: 30 }))).toEqual({ cost: 60, basis: 'per-package', packages: 3 })
  })

  it('prices a count of pieces as whole packages, including explicit multipacks', () => {
    expect(costForNeed({ quantity: 3, unit: 'ks' }, hit({ regularPrice: 24.9, unitPrice: 24.9, unit: 'ks' }))).toEqual({ cost: 74.7, basis: 'per-package', packages: 3 })
    expect(costForNeed({ quantity: 2, unit: 'ks' }, hit({ regularPrice: 30, dealPrice: 22.9, unit: 'ks' }))).toEqual({ cost: 45.8, basis: 'per-package', packages: 2 })
    expect(costForNeed({ quantity: 2, unit: 'ks' }, hit({
      regularPrice: 40,
      unitPrice: 4,
      unit: 'ks',
      packageSize: { quantity: 10, unit: 'ks', label: '10 ks', source: 'name-extracted' },
    }))).toEqual({ cost: 40, basis: 'per-package', packages: 1 })
    expect(costForNeed({ quantity: 10, unit: 'ks' }, hit({
      regularPrice: 40,
      unitPrice: 4,
      unit: 'ks',
      packageSize: { quantity: 10, unit: 'ks', label: '10 ks', source: 'name-extracted' },
    }))).toEqual({ cost: 40, basis: 'per-package', packages: 1 })
    expect(costForNeed({ quantity: 11, unit: 'ks' }, hit({
      regularPrice: 40,
      unitPrice: 4,
      unit: 'ks',
      packageSize: { quantity: 10, unit: 'ks', label: '10 ks', source: 'name-extracted' },
    }))).toEqual({ cost: 80, basis: 'per-package', packages: 2 })
  })

  it('prices a count of pieces of a packed weight or volume product as whole packages', () => {
    // "Hrozny tmavé bezsemenné 500 g": 29.90 Kč on promotion, 59.80 Kč/kg.
    expect(costForNeed({ quantity: 1, unit: 'ks' }, hit({ regularPrice: 59.9, dealPrice: 29.9, unitPrice: 119.8, unit: 'kg' }))).toEqual({ cost: 29.9, basis: 'per-package', packages: 1 })
    expect(costForNeed({ quantity: 2, unit: 'ks' }, hit({ regularPrice: 25, unitPrice: 25, unit: 'l', packageSize: { quantity: 1, unit: 'l', label: '1 l', source: 'name-extracted' } }))).toEqual({ cost: 50, basis: 'per-package', packages: 2 })
  })

  it('does not price a count of pieces of goods sold loose by weight', () => {
    // "Hrozny bílé volné, střapec": 154.90 Kč per kilogram, no pack.
    expect(costForNeed({ quantity: 1, unit: 'ks' }, hit({ regularPrice: 154.9, unitPrice: 154.9, unit: 'kg' }))).toBeNull()
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

  it('rounds the final package total to whole haléře', () => {
    expect(costForNeed({ quantity: 1, unit: 'l' }, hit({ regularPrice: 30, unitPrice: 19.996 }))?.cost).toBe(30)
  })

  it('prices a need from the offer when there is no regular price at all', () => {
    const butter = offerHit({ dealPrice: 39.9, dealUnitPrice: 159.6, unitPrice: 159.6, unit: 'kg' })
    expect(costForNeed({ quantity: 250, unit: 'g' }, butter)).toEqual({ cost: 39.9, basis: 'per-package', packages: 1 })
    expect(costForNeed({ quantity: 500, unit: 'g' }, butter)).toEqual({ cost: 79.8, basis: 'per-package', packages: 2 })
  })

  it('leaves an offer with no price stated out of the plan rather than inventing one', () => {
    const bare = offerHit({ dealPrice: null, dealUnitPrice: null, unitPrice: null, unit: null })
    expect(costForNeed({ quantity: 1, unit: 'ks' }, bare)).toBeNull()
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

  it('offers a chain\'s offer for a product the app has no regular price for', () => {
    const offer = offerHit({ productId: 'p', name: 'Mléko polotučné', score: 6, dealPrice: 19.9, dealUnitPrice: 19.9, unitPrice: 19.9, unit: 'l' })
    expect(pickAutoHit(need, [offer])).toMatchObject({ cost: { cost: 19.9, packages: 1 } })
  })
})

describe('pickTypedHit', () => {
  it('offers the cheapest product of the accepted types for the need, whatever its text score', () => {
    const breast = hit({ productId: 'breast', name: 'Kuřecí prsní řízky 500 g', unit: 'kg', regularPrice: 75, unitPrice: 150, score: 9 })
    const thighs = hit({ productId: 'thighs', name: 'Kuřecí stehna 1 kg', unit: 'kg', regularPrice: 90, unitPrice: 90, score: 1, direct: false })
    expect(pickTypedHit({ quantity: 1, unit: 'kg' }, [breast, thighs])?.hit.productId).toBe('thighs')
  })

  it("offers a chain's packed promotion for a piece need, not only products priced per piece (regression 2026-10-06)", () => {
    // "Hrozny bezsemenné, 1 ks": Lidl prices its grapes per piece at 79.90 Kč, Albert sells a 500 g pack
    // priced per kilogram, on promotion at 29.90 Kč.
    const lidl = hit({ productId: 'lidl', name: 'Bílé hrozny stolní', unit: 'ks', regularPrice: 79.9, unitPrice: 79.9 })
    const albert = hit({ productId: 'albert', name: 'Hrozny tmavé bezsemenné 500 g', unit: 'kg', regularPrice: 59.9, dealPrice: 29.9, unitPrice: 119.8 })
    expect(pickTypedHit({ quantity: 1, unit: 'ks' }, [lidl, albert])?.hit.productId).toBe('albert')
  })

  it('breaks a cost tie by unit price, then name, and offers nothing it cannot price', () => {
    const a = hit({ productId: 'a', name: 'B máslo', unit: 'ks', regularPrice: 50, unitPrice: 200 })
    const b = hit({ productId: 'b', name: 'A máslo', unit: 'ks', regularPrice: 50, unitPrice: 180 })
    expect(pickTypedHit({ quantity: 1, unit: 'ks' }, [a, b])?.hit.productId).toBe('b')
    expect(pickTypedHit({ quantity: 1, unit: 'l' }, [a, b])).toBeNull()
  })
})
