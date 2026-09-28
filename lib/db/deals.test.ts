import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import { getDealsPage } from '@/lib/db/deals'
import * as schema from '@/lib/db/schema'
import { DEALS_PAGE_SIZE } from '@/lib/deals-browse'

// Integration coverage of the Akce tab's paged deal browsing against the real test database. Two
// isolated online-only chains (no branches to keep the fixtures small) with their own uniquely-named
// products keep every assertion exact even though the shared test database also carries the app's
// normal deals — every test filters by its own chain name, which nothing else can match. Deal
// assessment itself (isBestPrice, discount…) is lib/prices.test.ts's job; this only checks that the
// right (product, chain) pairs are found, filtered, paged and handed to it.
const db = getDb()
const today = '2020-01-01' // always in the past
const farFuture = '2099-01-01' // always in the future — the deal is always "running today"

async function createChain(): Promise<{ id: string; chain: string }> {
  const [store] = await db.insert(schema.stores).values({ chain: `__test_deals_${crypto.randomUUID()}`, isOnline: true }).returning()
  return store
}

async function createProduct(categoryName: 'Potraviny' | 'Drogerie', name?: string, subcategoryName?: string): Promise<{ id: string; name: string }> {
  const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, categoryName) })
  let subcategoryId: string | null = null
  if (subcategoryName) {
    const subcategory = await db.query.productSubcategories.findFirst({ where: and(eq(schema.productSubcategories.category, categoryName), eq(schema.productSubcategories.name, subcategoryName)) })
    subcategoryId = subcategory!.id
  }
  const [product] = await db.insert(schema.products).values({ name: name ?? `__test_deal_product_${crypto.randomUUID()}`, categoryId: category!.id, subcategoryId }).returning()
  return product
}

/** A chain-wide regular price (so the deal below has something to compare against) and a running
 *  deal, for a product at a chain with no branches. */
async function givePriceAndDeal(productId: string, storeId: string, regularPrice: number, dealPrice: number) {
  await db.insert(schema.prices).values({
    productId,
    storeId,
    storeLocationId: null,
    priceScope: 'CHAIN',
    locationResolution: 'NOT_APPLICABLE',
    regularPrice: regularPrice.toString(),
    unit: 'ks',
    unitPrice: regularPrice.toString(),
    observedAt: today,
    validFrom: today,
  })
  await db.insert(schema.deals).values({ productId, storeId, storeLocationId: null, dealPrice: dealPrice.toString(), validFrom: today, validUntil: farFuture })
}

const createdProductIds: string[] = []
const createdStoreIds: string[] = []

afterAll(async () => {
  await db.delete(schema.deals).where(inArray(schema.deals.productId, createdProductIds))
  await db.delete(schema.prices).where(inArray(schema.prices.productId, createdProductIds))
  await db.delete(schema.products).where(inArray(schema.products.id, createdProductIds))
  await db.delete(schema.stores).where(inArray(schema.stores.id, createdStoreIds))
}, 60_000)

describe('getDealsPage', () => {
  it('finds a running deal at its chain, assessed against its regular price', async () => {
    const store = await createChain()
    const product = await createProduct('Potraviny')
    createdStoreIds.push(store.id)
    createdProductIds.push(product.id)
    await givePriceAndDeal(product.id, store.id, 100, 60)

    const result = await getDealsPage({ category: 'all', chain: store.chain, sort: 'name', page: 1 })
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
    expect(result.deals).toHaveLength(1)
    expect(result.deals[0].product.productName).toBe(product.name)
    expect(result.deals[0].price.store).toBe(store.chain)
    expect(result.deals[0].price.dealPrice).toBe(60)
    // The only store for this product, so its own deal is trivially the best price.
    expect(result.deals[0].isBestPrice).toBe(true)
  })

  it('sorts by price and by discount size, with an offer (no discount) sinking to the end', async () => {
    const store = await createChain()
    createdStoreIds.push(store.id)
    // cheap: 50 Kč, small discount (20%). pricey: 90 Kč, big discount (55%). offerOnly: no price at all.
    const cheap = await createProduct('Potraviny')
    const pricey = await createProduct('Potraviny')
    const offerOnly = await createProduct('Potraviny')
    createdProductIds.push(cheap.id, pricey.id, offerOnly.id)
    await givePriceAndDeal(cheap.id, store.id, 62.5, 50)
    await givePriceAndDeal(pricey.id, store.id, 200, 90)
    await db.insert(schema.deals).values({ productId: offerOnly.id, storeId: store.id, storeLocationId: null, dealPrice: '10', validFrom: today, validUntil: farFuture })

    const byPrice = await getDealsPage({ category: 'all', chain: store.chain, sort: 'price', page: 1 })
    expect(byPrice.deals.map((entry) => entry.price.dealPrice)).toEqual([50, 90])
    expect(byPrice.offers).toHaveLength(1) // cheapest of all (10 Kč), but it has no price to sort by

    const byDiscount = await getDealsPage({ category: 'all', chain: store.chain, sort: 'discount', page: 1 })
    expect(byDiscount.deals.map((entry) => entry.product.productName)).toEqual([pricey.name, cheap.name])
    expect(byDiscount.offers.map((offer) => offer.productName)).toEqual([offerOnly.name])
  })

  it('filters by category, excluding a deal from a different category', async () => {
    const store = await createChain()
    const food = await createProduct('Potraviny')
    const drugstore = await createProduct('Drogerie')
    createdStoreIds.push(store.id)
    createdProductIds.push(food.id, drugstore.id)
    await givePriceAndDeal(food.id, store.id, 50, 40)
    await givePriceAndDeal(drugstore.id, store.id, 80, 70)

    const foodOnly = await getDealsPage({ category: 'Potraviny', chain: store.chain, sort: 'name', page: 1 })
    expect(foodOnly.total).toBe(1)
    expect(foodOnly.deals[0].product.productName).toBe(food.name)

    const drugstoreOnly = await getDealsPage({ category: 'Drogerie', chain: store.chain, sort: 'name', page: 1 })
    expect(drugstoreOnly.total).toBe(1)
    expect(drugstoreOnly.deals[0].product.productName).toBe(drugstore.name)

    const all = await getDealsPage({ category: 'all', chain: store.chain, sort: 'name', page: 1 })
    expect(all.total).toBe(2)
  })

  it('lists a deal with no matching regular price as an offer instead of a discount', async () => {
    const store = await createChain()
    const withPrice = await createProduct('Potraviny')
    const offerOnly = await createProduct('Potraviny')
    createdStoreIds.push(store.id)
    createdProductIds.push(withPrice.id, offerOnly.id)
    await givePriceAndDeal(withPrice.id, store.id, 30, 20)
    // A deal with no price row at all — no regular price to compare against.
    await db.insert(schema.deals).values({ productId: offerOnly.id, storeId: store.id, storeLocationId: null, dealPrice: '15', validFrom: today, validUntil: farFuture })

    const result = await getDealsPage({ category: 'all', chain: store.chain, sort: 'name', page: 1 })
    expect(result.total).toBe(2)
    expect(result.deals.map((entry) => entry.product.productName)).toEqual([withPrice.name])
    expect(result.offers).toEqual([expect.objectContaining({ productName: offerOnly.name, store: store.chain, dealPrice: 15 })])
  })

  it('paginates deterministically, by product name, and falls back to the last page past the end', async () => {
    const store = await createChain()
    createdStoreIds.push(store.id)
    const count = DEALS_PAGE_SIZE + 1
    const products = await Promise.all(Array.from({ length: count }, () => createProduct('Potraviny')))
    createdProductIds.push(...products.map((product) => product.id))
    for (const product of products) await givePriceAndDeal(product.id, store.id, 100, 50)

    const firstPage = await getDealsPage({ category: 'all', chain: store.chain, sort: 'name', page: 1 })
    const secondPage = await getDealsPage({ category: 'all', chain: store.chain, sort: 'name', page: 2 })
    expect(firstPage.total).toBe(count)
    expect(firstPage.deals).toHaveLength(DEALS_PAGE_SIZE)
    expect(secondPage.deals).toHaveLength(1)
    const namesInOrder = [...firstPage.deals, ...secondPage.deals].map((entry) => entry.product.productName)
    expect(namesInOrder).toEqual([...products].map((product) => product.name).sort((a, b) => a.localeCompare(b)))

    // Only one page exists beyond the second; a far-out page number falls back to it instead of
    // returning nothing.
    const pastTheEnd = await getDealsPage({ category: 'all', chain: store.chain, sort: 'name', page: 99 })
    expect(pastTheEnd.page).toBe(2)
    expect(pastTheEnd.deals).toHaveLength(1)
  })

  it('paginates offers together with deals under one shared total (an earlier version left every offer unpaged)', async () => {
    const store = await createChain()
    createdStoreIds.push(store.id)
    const count = DEALS_PAGE_SIZE + 2
    const products = await Promise.all(Array.from({ length: count }, () => createProduct('Potraviny')))
    createdProductIds.push(...products.map((product) => product.id))
    // No price rows at all: every one of these is an offer, not a deal.
    await db.insert(schema.deals).values(products.map((product) => ({ productId: product.id, storeId: store.id, storeLocationId: null, dealPrice: '10', validFrom: today, validUntil: farFuture })))

    const firstPage = await getDealsPage({ category: 'all', chain: store.chain, sort: 'name', page: 1 })
    expect(firstPage.total).toBe(count)
    expect(firstPage.deals).toHaveLength(0)
    expect(firstPage.offers).toHaveLength(DEALS_PAGE_SIZE)
    const secondPage = await getDealsPage({ category: 'all', chain: store.chain, sort: 'name', page: 2 })
    expect(secondPage.offers).toHaveLength(count - DEALS_PAGE_SIZE)
  })

  it('returns nothing for a chain with no running deals', async () => {
    const store = await createChain()
    createdStoreIds.push(store.id)
    expect(await getDealsPage({ category: 'all', chain: store.chain, sort: 'name', page: 1 })).toEqual({ deals: [], offers: [], total: 0, page: 1 })
  })

  it('sorts by store across chains, not by product name', async () => {
    const storeA = await createChain()
    const storeB = await createChain()
    createdStoreIds.push(storeA.id, storeB.id)
    // Names deliberately out of alphabetical order with the chains (`__test_deals_<uuid>`, so
    // whichever chain sorts first is random), so a 'store' sort can only pass by actually grouping by
    // chain, not by coincidentally matching a name sort. A shared unique word (via the search filter,
    // no chain filter) isolates these two from the rest of the shared test database's real deals.
    const marker = `sorttest${crypto.randomUUID().replace(/-/g, '')}`
    const inA = await createProduct('Potraviny', `Zebra ${marker}`)
    const inB = await createProduct('Potraviny', `Almara ${marker}`)
    createdProductIds.push(inA.id, inB.id)
    await givePriceAndDeal(inA.id, storeA.id, 50, 40)
    await givePriceAndDeal(inB.id, storeB.id, 50, 40)

    const expectedOrder = [storeA.chain < storeB.chain ? inA.name : inB.name, storeA.chain < storeB.chain ? inB.name : inA.name]
    const result = await getDealsPage({ category: 'all', chain: null, sort: 'store', page: 1, query: marker })
    expect(result.total).toBe(2)
    expect(result.deals.map((entry) => entry.product.productName)).toEqual(expectedOrder)
  })

  describe('search', () => {
    it('finds a deal by a word in the product name, ignoring case and diacritics', async () => {
      const store = await createChain()
      createdStoreIds.push(store.id)
      const chicken = await createProduct('Potraviny', `Kuřecí prsa __test_deal_${crypto.randomUUID()}`)
      const other = await createProduct('Potraviny', `Jogurt bílý __test_deal_${crypto.randomUUID()}`)
      createdProductIds.push(chicken.id, other.id)
      await givePriceAndDeal(chicken.id, store.id, 100, 80)
      await givePriceAndDeal(other.id, store.id, 20, 15)

      const result = await getDealsPage({ category: 'all', chain: store.chain, sort: 'name', page: 1, query: 'kureci' })
      expect(result.total).toBe(1)
      expect(result.deals[0].product.productName).toBe(chicken.name)
    })

    it('finds a deal by a synonym of a word in the product name (lib/synonyms.ts)', async () => {
      const store = await createChain()
      createdStoreIds.push(store.id)
      const eggs = await createProduct('Potraviny', `Vejce M 10 ks __test_deal_${crypto.randomUUID()}`)
      const other = await createProduct('Potraviny', `Jogurt bílý __test_deal_${crypto.randomUUID()}`)
      createdProductIds.push(eggs.id, other.id)
      await givePriceAndDeal(eggs.id, store.id, 60, 45)
      await givePriceAndDeal(other.id, store.id, 20, 15)

      const result = await getDealsPage({ category: 'all', chain: store.chain, sort: 'name', page: 1, query: 'vajíčka' })
      expect(result.total).toBe(1)
      expect(result.deals[0].product.productName).toBe(eggs.name)
    })

    it('finds a deal by its category name even when the product name does not contain it', async () => {
      const store = await createChain()
      createdStoreIds.push(store.id)
      const soap = await createProduct('Drogerie', `__test_deal_product_${crypto.randomUUID()}`)
      const food = await createProduct('Potraviny', `__test_deal_product_${crypto.randomUUID()}`)
      createdProductIds.push(soap.id, food.id)
      await givePriceAndDeal(soap.id, store.id, 60, 45)
      await givePriceAndDeal(food.id, store.id, 30, 25)

      const result = await getDealsPage({ category: 'all', chain: store.chain, sort: 'name', page: 1, query: 'drogerie' })
      expect(result.total).toBe(1)
      expect(result.deals[0].product.productName).toBe(soap.name)
    })

    it('finds a deal by its subcategory name', async () => {
      const store = await createChain()
      createdStoreIds.push(store.id)
      const dairy = await createProduct('Potraviny', `__test_deal_product_${crypto.randomUUID()}`, 'Mléčné výrobky')
      const bakery = await createProduct('Potraviny', `__test_deal_product_${crypto.randomUUID()}`, 'Pečivo')
      createdProductIds.push(dairy.id, bakery.id)
      await givePriceAndDeal(dairy.id, store.id, 40, 30)
      await givePriceAndDeal(bakery.id, store.id, 20, 15)

      const result = await getDealsPage({ category: 'all', chain: store.chain, sort: 'name', page: 1, query: 'mlecne' })
      expect(result.total).toBe(1)
      expect(result.deals[0].product.productName).toBe(dairy.name)
    })

    it('requires every word of a multi-word search', async () => {
      const store = await createChain()
      createdStoreIds.push(store.id)
      const match = await createProduct('Potraviny', `Kuřecí prsa chlazená __test_deal_${crypto.randomUUID()}`)
      const partial = await createProduct('Potraviny', `Kuřecí polévka __test_deal_${crypto.randomUUID()}`)
      createdProductIds.push(match.id, partial.id)
      await givePriceAndDeal(match.id, store.id, 100, 80)
      await givePriceAndDeal(partial.id, store.id, 20, 15)

      const result = await getDealsPage({ category: 'all', chain: store.chain, sort: 'name', page: 1, query: 'kureci prsa' })
      expect(result.total).toBe(1)
      expect(result.deals[0].product.productName).toBe(match.name)
    })

    it('returns nothing for a search with no match, without erroring', async () => {
      const store = await createChain()
      createdStoreIds.push(store.id)
      const product = await createProduct('Potraviny')
      createdProductIds.push(product.id)
      await givePriceAndDeal(product.id, store.id, 50, 40)

      const result = await getDealsPage({ category: 'all', chain: store.chain, sort: 'name', page: 1, query: 'neexistujiciproduktxyz' })
      expect(result).toEqual({ deals: [], offers: [], total: 0, page: 1 })
    })
  })
})
