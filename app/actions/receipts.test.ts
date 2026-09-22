import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { ReceiptLineItem } from '@/lib/receipts'

// Continues the Server Action test coverage started in app/actions/shopping.test.ts.
let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({ requireHouseholdId: () => Promise.resolve(currentHouseholdId) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { importReceiptAction } from '@/app/actions/receipts'

const db = getDb()
const createdHouseholdIds: string[] = []
let householdId: string

const item = (overrides: Partial<ReceiptLineItem> = {}): ReceiptLineItem => ({
  name: 'Rýže',
  category: 'Potraviny',
  quantity: 1,
  unit: 'ks',
  price: 40,
  ...overrides,
})

beforeEach(async () => {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_receipts__' }).returning()
  householdId = household.id
  createdHouseholdIds.push(householdId)
  currentHouseholdId = householdId
})

afterAll(async () => {
  // households cascades to purchases/purchase_items/pantry_items/receipt_imports (all onDelete: 'cascade').
  for (const id of createdHouseholdIds) {
    await db.delete(schema.households).where(eq(schema.households.id, id))
  }
})

describe('importReceiptAction', () => {
  it('rejects an empty receipt', async () => {
    await expect(importReceiptAction([])).rejects.toThrow('Receipt has no items')
  })

  it('creates a real purchase from manually-entered line items', async () => {
    const { purchase } = await importReceiptAction([item({ name: 'Rýže', price: 40, quantity: 2 }), item({ name: 'Chleba', price: 25, quantity: 1 })])
    expect(purchase.total).toBe(40 * 2 + 25)
    expect(purchase.items.map((i) => i.name).sort()).toEqual(['Chleba', 'Rýže'])

    const purchaseRow = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, purchase.id) })
    expect(purchaseRow?.householdId).toBe(householdId)
  })

  it('restocks the pantry for every imported item', async () => {
    await importReceiptAction([item({ name: 'Mléko polotučné', category: 'Potraviny', quantity: 2 })])
    const pantryRow = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(pantryRow?.name).toBe('Mléko polotučné')
    expect(pantryRow?.quantity).toBe(2)
    expect(pantryRow?.location).toBe('Lednice')
  })

  it('records a receipt_imports row linked to the created purchase', async () => {
    const { purchase } = await importReceiptAction([item()])
    const receiptRow = await db.query.receiptImports.findFirst({ where: eq(schema.receiptImports.householdId, householdId) })
    expect(receiptRow?.source).toBe('manual')
    expect(receiptRow?.status).toBe('imported')
    expect(receiptRow?.purchaseId).toBe(purchase.id)
    expect(JSON.parse(receiptRow!.items)).toEqual([item()])
  })
})
