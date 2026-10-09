import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

const db = getDb()

describe('Product Subtype database model', () => {
  it('allows a subtype only under its parent Product Type', async () => {
    const [parentType, otherType, category] = await Promise.all([
      db.query.productTypes.findFirst({ where: eq(schema.productTypes.key, 'maslo') }),
      db.query.productTypes.findFirst({ where: eq(schema.productTypes.key, 'mleko-polotucne') }),
      db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') }),
    ])
    expect(parentType).toBeDefined()
    expect(otherType).toBeDefined()
    expect(category).toBeDefined()

    const suffix = crypto.randomUUID()
    const [subtype] = await db.insert(schema.productSubtypes).values({
      productTypeId: parentType!.id,
      key: `test-subtype-${suffix}`,
      name: `Test subtype ${suffix}`,
    }).returning()

    let validProductId: string | undefined
    try {
      const [validProduct] = await db.insert(schema.products).values({
        name: `Test Product Subtype ${suffix}`,
        categoryId: category!.id,
        productTypeId: parentType!.id,
        productSubtypeId: subtype.id,
        productSubtypeSource: 'manual',
      }).returning()
      validProductId = validProduct.id
      expect(validProduct).toMatchObject({ productSubtypeId: subtype.id, productSubtypeSource: 'manual' })

      await expect(db.insert(schema.products).values({
        name: `Invalid Subtype Source ${suffix}`,
        categoryId: category!.id,
        productTypeId: parentType!.id,
        productSubtypeId: subtype.id,
        productSubtypeSource: 'unknown',
      })).rejects.toThrow()

      await expect(db.insert(schema.products).values({
        name: `Wrong Parent Product Subtype ${suffix}`,
        categoryId: category!.id,
        productTypeId: otherType!.id,
        productSubtypeId: subtype.id,
        productSubtypeSource: 'manual',
      })).rejects.toThrow()

      await expect(db.insert(schema.products).values({
        name: `Missing Parent Product Subtype ${suffix}`,
        categoryId: category!.id,
        productSubtypeId: subtype.id,
        productSubtypeSource: 'manual',
      })).rejects.toThrow()
    } finally {
      if (validProductId) await db.delete(schema.products).where(eq(schema.products.id, validProductId))
      await db.delete(schema.productSubtypes).where(eq(schema.productSubtypes.id, subtype.id))
    }
  })
})
