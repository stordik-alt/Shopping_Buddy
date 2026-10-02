import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'

vi.mock('@/lib/db/cache-invalidation', () => ({ invalidateProductCatalogCache: vi.fn() }))
import * as schema from '@/lib/db/schema'
import { decideSubcategoryChange, listPendingSubcategoryChanges, proposeProductSubcategory } from '@/lib/db/subcategory-changes'

const db = getDb()
const householdIds: string[] = []
const productIds: string[] = []

afterAll(async () => {
  for (const id of productIds) await db.delete(schema.products).where(eq(schema.products.id, id))
  for (const id of householdIds) await db.delete(schema.households).where(eq(schema.households.id, id))
})

async function setup() {
  const [household] = await db.insert(schema.households).values({ name: '__test_subcat_changes__' }).returning()
  householdIds.push(household.id)
  const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
  const [product] = await db.insert(schema.products).values({ name: `__test_subcat_product_${Date.now()}__`, categoryId: category!.id }).returning()
  productIds.push(product.id)
  return { householdId: household.id, productId: product.id }
}

async function subcategoryOf(productId: string) {
  return (await db.query.products.findFirst({ where: eq(schema.products.id, productId), with: { subcategory: true } }))?.subcategory?.name ?? null
}

describe('proposeProductSubcategory', () => {
  it('applies the first placement and three moves at once, then holds the fourth move for approval', async () => {
    const { householdId, productId } = await setup()
    expect(await proposeProductSubcategory(householdId, productId, 'Potraviny', 'Pečivo')).toBe('applied') // first placement, not a move
    expect(await proposeProductSubcategory(householdId, productId, 'Potraviny', 'Maso a uzeniny')).toBe('applied') // move 1
    expect(await proposeProductSubcategory(householdId, productId, 'Potraviny', 'Nápoje')).toBe('applied') // move 2
    expect(await proposeProductSubcategory(householdId, productId, 'Potraviny', 'Pečivo')).toBe('applied') // move 3
    expect(await proposeProductSubcategory(householdId, productId, 'Potraviny', 'Maso a uzeniny')).toBe('pending') // move 4
    expect(await subcategoryOf(productId)).toBe('Pečivo')
    expect(await proposeProductSubcategory(householdId, productId, 'Potraviny', 'Pečivo')).toBe('unchanged')
  })

  it('applies a pending proposal only when an administrator approves it, and keeps the catalog on reject', async () => {
    const { householdId, productId } = await setup()
    for (const name of ['Pečivo', 'Nápoje', 'Pečivo', 'Nápoje']) await proposeProductSubcategory(householdId, productId, 'Potraviny', name)
    await proposeProductSubcategory(householdId, productId, 'Potraviny', 'Maso a uzeniny')
    await proposeProductSubcategory(householdId, productId, 'Potraviny', 'Maso a uzeniny') // duplicate proposal is ignored
    const pending = (await listPendingSubcategoryChanges()).filter((change) => change.householdName === '__test_subcat_changes__' && change.toName === 'Maso a uzeniny')
    expect(pending.length).toBeGreaterThanOrEqual(1)
    const mine = await db.query.productSubcategoryChanges.findMany({ where: eq(schema.productSubcategoryChanges.productId, productId) })
    const waiting = mine.filter((row) => row.status === 'pending')
    expect(waiting).toHaveLength(1)
    expect(await subcategoryOf(productId)).toBe('Nápoje')
    expect(await decideSubcategoryChange(waiting[0].id, true, '00000000-0000-0000-0000-000000000000')).toBe(true)
    expect(await subcategoryOf(productId)).toBe('Maso a uzeniny')
    expect(await decideSubcategoryChange(waiting[0].id, true, '00000000-0000-0000-0000-000000000000')).toBe(false)
  })

  it('rejects a name outside the category list', async () => {
    const { householdId, productId } = await setup()
    await expect(proposeProductSubcategory(householdId, productId, 'Potraviny', 'Kosmetika a hygiena')).rejects.toThrow('Neplatná podkategorie')
  })
})
