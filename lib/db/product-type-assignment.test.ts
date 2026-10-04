import { eq, inArray } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import { applyProductTypeAssignment, loadProductTypeIds, planProductTypeAssignment } from '@/lib/db/product-type-assignment'
import { upsertProductCatalogDefaults } from '@/lib/db/queries'
import * as schema from '@/lib/db/schema'
import { PRODUCT_TYPE_GROUPS, PRODUCT_TYPES } from '@/lib/product-types'

// The catalog cache is Next.js's; outside a request there is nothing to invalidate.
vi.mock('@/lib/db/cache-invalidation', () => ({ invalidateProductCatalogCache: vi.fn(), invalidateProductPriceCache: vi.fn() }))

// Product types in the test database (local PostgreSQL): the rows migration 0062 seeds must be the
// code's list, and the assignment must respect a person's own choice. Throwaway products only.
const db = getDb()

describe('product types in the database', () => {
  it('has exactly the types and groups lib/product-types.ts defines', async () => {
    const types = await db.select().from(schema.productTypes)
    expect(types.map((row) => [row.key, row.name, row.category, row.unit]).sort()).toEqual(
      PRODUCT_TYPES.map((type) => [type.key, type.name, type.categories[0], type.unit]).sort(),
    )
    const members = await db.query.productTypeGroupMembers.findMany({ with: { group: true, type: true } })
    expect(members.map((row) => `${row.group.key}:${row.type.key}`).sort()).toEqual(
      PRODUCT_TYPE_GROUPS.flatMap((group) => group.types.map((type) => `${group.key}:${type}`)).sort(),
    )
  })

  it('assigns types by the rules, keeps a manual one, and gives a new receipt product its type at once', async () => {
    const potraviny = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const typeIds = await loadProductTypeIds()
    const suffix = crypto.randomUUID()
    const [butter, cookies, manual] = await db
      .insert(schema.products)
      .values([
        { name: `Máslo 250 g __test ${suffix}`, categoryId: potraviny!.id },
        { name: `Máslové sušenky __test ${suffix}`, categoryId: potraviny!.id, productTypeId: typeIds.get('maslo'), productTypeSource: 'rule' },
        // A person decided this is butter; the rules would say nothing.
        { name: `Xyzzy __test ${suffix}`, categoryId: potraviny!.id, productTypeId: typeIds.get('maslo'), productTypeSource: 'manual' },
      ])
      .returning()
    const ids = [butter.id, cookies.id, manual.id]
    try {
      const plan = await planProductTypeAssignment({ productIds: ids })
      expect(plan).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: butter.id, from: null, to: 'maslo' }),
          expect.objectContaining({ id: cookies.id, from: 'maslo', to: null }),
        ]),
      )
      expect(plan.map((move) => move.id)).not.toContain(manual.id)
      expect(await applyProductTypeAssignment(plan)).toBe(2)

      const rows = await db.query.products.findMany({ where: inArray(schema.products.id, ids) })
      const row = (id: string) => rows.find((entry) => entry.id === id)!
      expect(row(butter.id)).toMatchObject({ productTypeId: typeIds.get('maslo'), productTypeSource: 'rule' })
      expect(row(cookies.id)).toMatchObject({ productTypeId: null, productTypeSource: null })
      expect(row(manual.id)).toMatchObject({ productTypeId: typeIds.get('maslo'), productTypeSource: 'manual' })
      expect(await planProductTypeAssignment({ productIds: ids })).toEqual([])

      // A product created from a confirmed receipt line gets its type right away.
      const name = `Kuřecí prsní řízky __test ${suffix}`
      await upsertProductCatalogDefaults({ name, category: 'Potraviny', unit: 'kg', location: 'Lednice' })
      const created = await db.query.products.findFirst({ where: eq(schema.products.name, name) })
      ids.push(created!.id)
      expect(created).toMatchObject({ productTypeId: typeIds.get('kureci-prsa'), productTypeSource: 'rule' })
    } finally {
      await db.delete(schema.products).where(inArray(schema.products.id, ids))
    }
  })
})
