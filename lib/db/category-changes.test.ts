import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { decideCategoryChange, proposeProductCategory } from '@/lib/db/category-changes'
import { getDb } from '@/lib/db/client'

vi.mock('@/lib/db/cache-invalidation', () => ({ invalidateProductCatalogCache: vi.fn() }))
import { upsertProductCatalogDefaults } from '@/lib/db/queries'
import * as schema from '@/lib/db/schema'

const db = getDb()
const householdIds: string[] = []
const productIds: string[] = []
const ADMIN = '00000000-0000-0000-0000-000000000001'

afterAll(async () => {
  for (const id of productIds) await db.delete(schema.products).where(eq(schema.products.id, id))
  for (const id of householdIds) await db.delete(schema.households).where(eq(schema.households.id, id))
})

async function setup() {
  const [household] = await db.insert(schema.households).values({ name: '__test_cat_changes__' }).returning()
  householdIds.push(household.id)
  const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Ostatní') })
  const [product] = await db.insert(schema.products).values({ name: `__test_cat_product_${Date.now()}_${productIds.length}__`, categoryId: category!.id }).returning()
  productIds.push(product.id)
  return { householdId: household.id, productId: product.id }
}

async function categoryOf(productId: string) {
  return (await db.query.products.findFirst({ where: eq(schema.products.id, productId), with: { category: true } }))?.category.name
}

async function waitingChange(productId: string) {
  const rows = await db.query.productCategoryChanges.findMany({ where: eq(schema.productCategoryChanges.productId, productId) })
  return rows.find((row) => row.status === 'pending')!
}

describe('proposeProductCategory', () => {
  it('applies three moves at once, then holds the fourth for approval', async () => {
    const { householdId, productId } = await setup()
    expect(await proposeProductCategory(householdId, productId, 'Potraviny')).toBe('applied')
    expect(await proposeProductCategory(householdId, productId, 'Drogerie')).toBe('applied')
    expect(await proposeProductCategory(householdId, productId, 'Domácnost')).toBe('applied')
    expect(await proposeProductCategory(householdId, productId, 'Potraviny')).toBe('pending')
    expect(await categoryOf(productId)).toBe('Domácnost')
    expect(await proposeProductCategory(householdId, productId, 'Domácnost')).toBe('unchanged')
  })

  it('approval applies the category and locks it for good', async () => {
    const { householdId, productId } = await setup()
    for (const name of ['Potraviny', 'Drogerie', 'Domácnost', 'Děti'] as const) await proposeProductCategory(householdId, productId, name)
    const waiting = await waitingChange(productId)
    expect(await decideCategoryChange(waiting.id, true, ADMIN)).toBe(true)
    expect(await decideCategoryChange(waiting.id, true, ADMIN)).toBe(false)
    expect(await categoryOf(productId)).toBe('Děti')
    expect(await proposeProductCategory(householdId, productId, 'Potraviny')).toBe('locked')
    expect(await categoryOf(productId)).toBe('Děti')
  })

  it('rejection keeps the category and locks it too, also against a receipt correction', async () => {
    const { householdId, productId } = await setup()
    for (const name of ['Potraviny', 'Drogerie', 'Domácnost', 'Děti'] as const) await proposeProductCategory(householdId, productId, name)
    const waiting = await waitingChange(productId)
    expect(await decideCategoryChange(waiting.id, false, ADMIN)).toBe(true)
    expect(await categoryOf(productId)).toBe('Domácnost')
    expect(await proposeProductCategory(householdId, productId, 'Děti')).toBe('locked')
    const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) })
    await upsertProductCatalogDefaults({ name: product!.name, category: 'Potraviny', unit: 'ks', location: 'Spíž' })
    expect(await categoryOf(productId)).toBe('Domácnost')
  })
})
