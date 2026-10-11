import { eq, ilike } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

vi.mock('@/lib/auth/authorize', () => ({ requireHouseholdId: () => Promise.reject(new Error('not used')) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: (...args: any[]) => any) => fn }))

import { createPurchaseFromReceiptItems } from '@/lib/receipt-import'

// A type the household picks for a receipt line in review ("Co to je?"): the line is stocked under
// that type, and the catalog remembers it for the printed text. Throwaway household and product.
const db = getDb()
const PRINTED = '__TEST KNORR JÍŠKA SVĚ.250G'
const created: string[] = []

async function household() {
  const [row] = await db.insert(schema.households).values({ name: '__test_household_receipt_line_type__' }).returning()
  created.push(row.id)
  return row.id
}

const line = (overrides: Record<string, unknown> = {}) => ({ name: PRINTED, category: 'Potraviny' as const, quantity: 2, unit: 'ks' as const, price: 30, location: 'Spíž' as const, ...overrides })

afterEach(async () => {
  for (const id of created.splice(0)) await db.delete(schema.households).where(eq(schema.households.id, id))
  await db.delete(schema.products).where(ilike(schema.products.name, PRINTED))
})

describe('product type picked in receipt review', () => {
  it('stocks the line under the chosen type and remembers it for the printed text', async () => {
    const householdId = await household()
    await createPurchaseFromReceiptItems(householdId, [line({ productTypeKey: 'jiska' })], { date: '2026-09-22', storeName: 'Albert', source: 'confirmed' })

    const pantry = await db.query.pantryItems.findMany({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(pantry.map((row) => [row.name, row.quantity, row.unit])).toEqual([['Jíška', 2, 'ks']])
    expect(pantry[0].productTypeId).not.toBeNull()

    const product = await db.query.products.findFirst({ where: ilike(schema.products.name, PRINTED), with: { productType: true } })
    expect(product?.productType?.key).toBe('jiska')
    expect(product?.productTypeSource).toBe('manual')

    // The next receipt with the same text needs no pick: the product knows its type.
    await createPurchaseFromReceiptItems(householdId, [line({ quantity: 1 })], { date: '2026-09-23', storeName: 'Albert', source: 'confirmed' })
    const after = await db.query.pantryItems.findMany({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(after.map((row) => [row.name, row.quantity])).toEqual([['Jíška', 3]])
  })

  it('rejects a type key the code does not know', async () => {
    const householdId = await household()
    await expect(
      createPurchaseFromReceiptItems(householdId, [line({ productTypeKey: 'neexistuje' })], { date: '2026-09-22', storeName: 'Albert', source: 'confirmed' }),
    ).rejects.toThrow('Neplatný druh zboží')
  })
})
