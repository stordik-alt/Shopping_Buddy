import { eq, inArray } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { suggestTypesForReceiptLines } from '@/lib/db/type-suggestions'

// Against the test database; throwaway catalog products with a made-up brand word so that only they
// are close to the queried lines.
const db = getDb()
const productIds: string[] = []

afterAll(async () => {
  if (productIds.length > 0) await db.delete(schema.products).where(inArray(schema.products.id, productIds))
})

describe('suggestTypesForReceiptLines', () => {
  it('offers the type of the closest typed catalog products, nothing for an unrelated line', async () => {
    const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const type = await db.query.productTypes.findFirst({ where: eq(schema.productTypes.key, 'jiska') })
    for (const name of ['Zzqx Jíška světlá 250 g', 'Zzqx Jíška tmavá 250 g']) {
      const [product] = await db.insert(schema.products).values({ name, categoryId: category!.id, defaultUnit: 'ks', productTypeId: type!.id, productTypeSource: 'rule' }).returning()
      productIds.push(product.id)
    }

    const [match, none] = await suggestTypesForReceiptLines(['ZZQX JÍŠKA SVĚ.250G', 'qwvbn plmkj xcvbn'])

    expect(match).toEqual([{ key: 'jiska', name: 'Jíška' }])
    expect(none).toEqual([])
  })
})
