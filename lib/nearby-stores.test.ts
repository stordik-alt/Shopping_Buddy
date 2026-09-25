import { describe, expect, it } from 'vitest'
import {
  BRANCH_LIST_LIMIT,
  EMPTY_STORE_SELECTION,
  MAX_DISTANCE_KM,
  MAX_SHOP_STORES,
  filterPricesToNearby,
  hasStoreSelection,
  isNearby,
  normalizeDistanceKm,
  normalizeMaxShopStores,
  normalizeStoreSelection,
  parseDistanceInput,
  visibleBranches,
  type StoreSelection,
} from '@/lib/nearby-stores'
import type { PricePoint, ProductPrice } from '@/lib/prices'

const point = (overrides: Partial<PricePoint> = {}): PricePoint => ({
  store: 'Lidl',
  storeId: 'lidl',
  storeLocationId: null,
  regularPrice: 50,
  unit: 'ks',
  unitPrice: 50,
  recordedAt: '2026-09-24',
  ...overrides,
})
const product = (name: string, prices: PricePoint[]): ProductPrice => ({ productName: name, category: 'Potraviny', prices })
const selection = (overrides: Partial<StoreSelection> = {}): StoreSelection => ({ maxDistanceKm: 2, chainIds: ['lidl', 'albert'], branches: [], priorityChainIds: [], maxShopStores: null, ...overrides })

describe('hasStoreSelection', () => {
  it('is false until at least one chain is chosen', () => {
    expect(hasStoreSelection(EMPTY_STORE_SELECTION)).toBe(false)
    expect(hasStoreSelection({ ...EMPTY_STORE_SELECTION, maxDistanceKm: 3 })).toBe(false) // a distance alone selects nothing
    expect(hasStoreSelection(selection())).toBe(true)
  })
})

describe('isNearby', () => {
  it('treats everything as nearby when nothing has been chosen', () => {
    expect(isNearby({ storeId: 'penny' }, EMPTY_STORE_SELECTION)).toBe(true)
  })

  it('accepts a chosen chain and rejects one that was not chosen', () => {
    expect(isNearby({ storeId: 'lidl' }, selection())).toBe(true)
    expect(isNearby({ storeId: 'penny' }, selection())).toBe(false)
  })

  it('accepts every price of a chosen chain when no specific branch was picked', () => {
    expect(isNearby({ storeId: 'lidl', storeLocationId: 'lidl-brno-1' }, selection())).toBe(true)
    expect(isNearby({ storeId: 'lidl', storeLocationId: null }, selection())).toBe(true)
  })

  it('with branches picked, accepts a branch-specific price only from a picked branch', () => {
    const picked = selection({ branches: [{ storeId: 'lidl', storeLocationId: 'lidl-brno-1' }] })
    expect(isNearby({ storeId: 'lidl', storeLocationId: 'lidl-brno-1' }, picked)).toBe(true)
    expect(isNearby({ storeId: 'lidl', storeLocationId: 'lidl-praha-9' }, picked)).toBe(false)
  })

  it('with branches picked, still accepts the retailer\'s chain-wide price', () => {
    const picked = selection({ branches: [{ storeId: 'lidl', storeLocationId: 'lidl-brno-1' }] })
    expect(isNearby({ storeId: 'lidl', storeLocationId: null }, picked)).toBe(true)
  })

  it('a branch picked in one chain does not restrict another chosen chain', () => {
    const picked = selection({ branches: [{ storeId: 'lidl', storeLocationId: 'lidl-brno-1' }] })
    expect(isNearby({ storeId: 'albert', storeLocationId: 'albert-anywhere' }, picked)).toBe(true)
  })

  it('keeps a price whose store cannot be identified instead of hiding it', () => {
    expect(isNearby({}, selection())).toBe(true)
  })
})

describe('filterPricesToNearby', () => {
  const prices = [
    product('Mléko', [point({ store: 'Lidl', storeId: 'lidl' }), point({ store: 'Penny', storeId: 'penny' })]),
    product('Máslo', [point({ store: 'Penny', storeId: 'penny' })]),
  ]

  it('returns the input untouched when nothing has been chosen', () => {
    expect(filterPricesToNearby(prices, EMPTY_STORE_SELECTION)).toBe(prices)
  })

  it('keeps only prices at nearby stores', () => {
    const result = filterPricesToNearby(prices, selection())
    expect(result[0].prices.map((price) => price.store)).toEqual(['Lidl'])
  })

  it('drops a product that has no price at any nearby store', () => {
    const result = filterPricesToNearby(prices, selection())
    expect(result.map((entry) => entry.productName)).toEqual(['Mléko'])
  })

  it('does not mutate its input', () => {
    filterPricesToNearby(prices, selection())
    expect(prices[0].prices).toHaveLength(2)
    expect(prices).toHaveLength(2)
  })

  it('returns an empty list when the chosen stores have no prices at all', () => {
    expect(filterPricesToNearby(prices, selection({ chainIds: ['tesco'] }))).toEqual([])
  })
})

describe('normalizeDistanceKm', () => {
  it('accepts a positive distance up to the limit, rounded to one decimal', () => {
    expect(normalizeDistanceKm(2)).toBe(2)
    expect(normalizeDistanceKm(1.26)).toBe(1.3)
    expect(normalizeDistanceKm(MAX_DISTANCE_KM)).toBe(MAX_DISTANCE_KM)
  })

  it('rejects zero, negative, too large and non-numbers', () => {
    expect(normalizeDistanceKm(0)).toBeNull()
    expect(normalizeDistanceKm(-1)).toBeNull()
    expect(normalizeDistanceKm(MAX_DISTANCE_KM + 0.1)).toBeNull()
    expect(normalizeDistanceKm(Number.NaN)).toBeNull()
    expect(normalizeDistanceKm(Number.POSITIVE_INFINITY)).toBeNull()
    expect(normalizeDistanceKm(null)).toBeNull()
    expect(normalizeDistanceKm(undefined)).toBeNull()
  })
})

describe('normalizeMaxShopStores', () => {
  it('accepts a whole number from 1 to 6', () => {
    for (const n of [1, 2, 3, 4, 5, MAX_SHOP_STORES]) expect(normalizeMaxShopStores(n)).toBe(n)
  })

  it('rejects zero, too many, fractions and non-numbers', () => {
    for (const bad of [0, -1, MAX_SHOP_STORES + 1, 2.5, Number.NaN, null, undefined]) expect(normalizeMaxShopStores(bad as number)).toBeNull()
  })
})

describe('priority stores and the store limit in a selection', () => {
  const branchChain = new Map([['lidl-brno-1', 'lidl']])

  it('keeps a priority store that is among the chosen chains', () => {
    const result = normalizeStoreSelection({ chainIds: ['lidl', 'albert'], priorityChainIds: ['albert'] }, branchChain)
    expect(result.priorityChainIds).toEqual(['albert'])
  })

  it('drops a priority store that is not chosen', () => {
    const result = normalizeStoreSelection({ chainIds: ['lidl'], priorityChainIds: ['albert', 'lidl'] }, branchChain)
    expect(result.priorityChainIds).toEqual(['lidl'])
  })

  it('counts a chain implied by a picked branch as chosen, so it can be a priority', () => {
    const result = normalizeStoreSelection({ chainIds: [], locationIds: ['lidl-brno-1'], priorityChainIds: ['lidl'] }, branchChain)
    expect(result.priorityChainIds).toEqual(['lidl'])
  })

  it('removes duplicate priority stores and validates the store count', () => {
    const result = normalizeStoreSelection({ chainIds: ['lidl'], priorityChainIds: ['lidl', 'lidl'], maxShopStores: 3 }, branchChain)
    expect(result.priorityChainIds).toEqual(['lidl'])
    expect(result.maxShopStores).toBe(3)
    expect(normalizeStoreSelection({ chainIds: ['lidl'], maxShopStores: 9 }, branchChain).maxShopStores).toBeNull()
  })
})

describe('parseDistanceInput', () => {
  it('reads a decimal point or a decimal comma', () => {
    expect(parseDistanceInput('1.5')).toBe(1.5)
    expect(parseDistanceInput('1,5')).toBe(1.5)
    expect(parseDistanceInput(' 2 ')).toBe(2)
  })

  it('treats an empty field as "not set"', () => {
    expect(parseDistanceInput('')).toBeNull()
    expect(parseDistanceInput('   ')).toBeNull()
  })

  it('reports anything that is not a plain number as NaN, so it can be shown instead of ignored', () => {
    expect(Number.isNaN(parseDistanceInput('abc'))).toBe(true)
    expect(Number.isNaN(parseDistanceInput('1,2,3'))).toBe(true)
    expect(Number.isNaN(parseDistanceInput('-2'))).toBe(true)
    expect(Number.isNaN(parseDistanceInput('2 km'))).toBe(true)
  })
})

describe('normalizeStoreSelection', () => {
  const branchChain = new Map([
    ['lidl-brno-1', 'lidl'],
    ['albert-brno-1', 'albert'],
  ])

  it('a picked branch selects its chain too, so a branch never exists without its chain', () => {
    const result = normalizeStoreSelection({ chainIds: [], locationIds: ['lidl-brno-1'] }, branchChain)
    expect(result.chainIds).toEqual(['lidl'])
    expect(result.branches).toEqual([{ storeId: 'lidl', storeLocationId: 'lidl-brno-1' }])
  })

  it('removes duplicates', () => {
    const result = normalizeStoreSelection({ chainIds: ['lidl', 'lidl', 'albert'], locationIds: ['lidl-brno-1', 'lidl-brno-1'] }, branchChain)
    expect(result.chainIds.sort()).toEqual(['albert', 'lidl'])
    expect(result.branches).toHaveLength(1)
  })

  it('drops a branch it does not know', () => {
    const result = normalizeStoreSelection({ chainIds: ['lidl'], locationIds: ['no-such-branch'] }, branchChain)
    expect(result.branches).toEqual([])
    expect(result.chainIds).toEqual(['lidl'])
  })

  it('validates the distance and treats missing input as an empty selection', () => {
    expect(normalizeStoreSelection({ maxDistanceKm: 500, chainIds: ['lidl'] }, branchChain).maxDistanceKm).toBeNull()
    expect(normalizeStoreSelection({ maxDistanceKm: 1.5 }, branchChain)).toEqual({ ...EMPTY_STORE_SELECTION, maxDistanceKm: 1.5 })
    expect(normalizeStoreSelection({}, branchChain)).toEqual(EMPTY_STORE_SELECTION)
  })
})

describe('visibleBranches', () => {
  const branch = (id: string, name: string, city: string) => ({ id, name, address: `${name} 1`, city })
  const branches = [branch('a', 'Penny Americká', 'Plzeň'), branch('b', 'Penny Slovanská', 'Plzeň'), branch('c', 'Penny Nádražní', 'Brno')]

  it('finds branches by any word of the name, address or city, ignoring diacritics', () => {
    expect(visibleBranches(branches, 'plzen', []).shown.map((b) => b.id)).toEqual(['a', 'b'])
    expect(visibleBranches(branches, 'NADRAZNI', []).shown.map((b) => b.id)).toEqual(['c'])
    expect(visibleBranches(branches, 'plzeň slovanská', []).shown.map((b) => b.id)).toEqual(['b'])
  })

  it('always shows the picked branches first, even when the search does not match them', () => {
    expect(visibleBranches(branches, 'brno', ['a']).shown.map((b) => b.id)).toEqual(['a', 'c'])
  })

  it('shows at most the limit and says how many match', () => {
    const many = Array.from({ length: 50 }, (_, i) => branch(`x${i}`, `Lidl Ulice ${i}`, 'Praha'))
    const { shown, total } = visibleBranches(many, 'praha', [])
    expect(shown).toHaveLength(BRANCH_LIST_LIMIT)
    expect(total).toBe(50)
  })
})
