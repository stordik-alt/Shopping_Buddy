import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import {
  AlreadyRecordedError,
  applyLearnedExpenseDefaults,
  getHouseholdProductExpenseDefaults,
  getPurchaseItemsForExpense,
  InvalidExpenseCategoryError,
  InvalidExpenseSplitError,
  NotFromReceiptError,
  NothingToRecordError,
  PurchaseNotFoundError,
  recomputePurchaseExpenses,
  recordPurchaseAsExpense,
  setPurchaseItemExpenseSplits,
} from '@/lib/db/purchase-items'
import * as schema from '@/lib/db/schema'

// Integration coverage of the household's manual expense-category split/reassignment
// (setPurchaseItemExpenseSplits) and the resulting "the app learns" behaviour, against the real test
// database: a purchase and its household are created here directly (not through a receipt import),
// since this layer only cares about purchase_items and expenses, not OCR. Each test deletes its own
// household(s) in a `finally` block (cascades to its purchase/purchase_items/expenses and any learned
// default), so nothing needs a shared afterAll.
const db = getDb()

async function createPurchase(items: { name: string; category: 'Potraviny' | 'Drogerie'; price: number; quantity?: number; productId?: string }[]) {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_purchase_items__' }).returning()
  const total = items.reduce((sum, item) => sum + item.price * (item.quantity ?? 1), 0)
  const [purchase] = await db.insert(schema.purchases).values({ householdId: household.id, date: '2026-09-27', total: total.toString() }).returning()
  const rows = await db
    .insert(schema.purchaseItems)
    .values(items.map((item) => ({ purchaseId: purchase.id, name: item.name, quantity: item.quantity ?? 1, price: item.price.toString(), category: item.category, productId: item.productId })))
    .returning()
  await recomputePurchaseExpenses(db, purchase.id) // the same call app/actions/receipts.ts makes at creation
  return { householdId: household.id, purchaseId: purchase.id, items: rows }
}

/** A purchase with no expenses yet — unlike `createPurchase` above, which immediately runs the split
 *  a real receipt import would. `fromReceipt` adds the `receipt_imports` row that makes a purchase
 *  eligible for `recordPurchaseAsExpense` at all (a completed-shopping-list purchase never gets one). */
async function createUnrecordedPurchase(
  items: { name: string; category?: 'Potraviny' | 'Drogerie'; price: number; quantity?: number }[],
  options: { fromReceipt?: boolean } = {},
) {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_purchase_items__' }).returning()
  const total = items.reduce((sum, item) => sum + item.price * (item.quantity ?? 1), 0)
  const [purchase] = await db.insert(schema.purchases).values({ householdId: household.id, date: '2026-09-27', total: total.toString() }).returning()
  const rows = await db
    .insert(schema.purchaseItems)
    .values(items.map((item) => ({ purchaseId: purchase.id, name: item.name, quantity: item.quantity ?? 1, price: item.price.toString(), category: item.category })))
    .returning()
  if (options.fromReceipt) {
    await db.insert(schema.receiptImports).values({ householdId: household.id, purchaseId: purchase.id, status: 'completed', source: 'manual' })
  }
  return { householdId: household.id, purchaseId: purchase.id, items: rows }
}

async function createProduct() {
  const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
  const [product] = await db.insert(schema.products).values({ name: `__test_purchase_item_product_${crypto.randomUUID()}`, categoryId: category!.id }).returning()
  return product
}

describe('setPurchaseItemExpenseSplits', () => {
  it('moves one item to its own category/subcategory, leaving the rest under the automatic mapping', async () => {
    const { householdId, purchaseId, items } = await createPurchase([
      { name: 'Mléko', category: 'Potraviny', price: 400 },
      { name: 'Dárkový koš', category: 'Potraviny', price: 100 },
    ])
    try {
      await setPurchaseItemExpenseSplits(householdId, items[1].id, [{ category: 'Ostatní', subcategory: 'Dárky', amount: 100 }])
      const expenses = await db.query.expenses.findMany({ where: eq(schema.expenses.purchaseId, purchaseId) })
      expect(expenses.map((row) => [row.category, row.subcategory, Number(row.amount)]).sort()).toEqual([
        ['Ostatní', 'Dárky', 100],
        ['Potraviny', null, 400],
      ])
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })

  it('splits one item across two targets, e.g. clothing the receipt does not say is a child\'s', async () => {
    const { householdId, purchaseId, items } = await createPurchase([{ name: 'Oblečení', category: 'Potraviny', price: 1000 }])
    try {
      await setPurchaseItemExpenseSplits(householdId, items[0].id, [
        { category: 'Oblečení a obuv', subcategory: 'Oblečení', amount: 600 },
        { category: 'Děti', subcategory: 'Oblečení pro děti', amount: 400 },
      ])
      const expenses = await db.query.expenses.findMany({ where: eq(schema.expenses.purchaseId, purchaseId) })
      expect(expenses.map((row) => [row.category, row.subcategory, Number(row.amount)]).sort()).toEqual([
        ['Děti', 'Oblečení pro děti', 400],
        ['Oblečení a obuv', 'Oblečení', 600],
      ])
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })

  it('rejects a split whose amounts do not add up to the item\'s own paid amount', async () => {
    const { householdId, items } = await createPurchase([{ name: 'X', category: 'Potraviny', price: 100 }])
    try {
      await expect(setPurchaseItemExpenseSplits(householdId, items[0].id, [{ category: 'Ostatní', subcategory: null, amount: 90 }])).rejects.toThrow(InvalidExpenseSplitError)
      await expect(
        setPurchaseItemExpenseSplits(householdId, items[0].id, [
          { category: 'Ostatní', subcategory: null, amount: 50 },
          { category: 'Potraviny', subcategory: null, amount: 60 },
        ]),
      ).rejects.toThrow(InvalidExpenseSplitError)
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })

  it('rejects too many splits, a non-positive amount, an invalid category, or a subcategory that does not belong to it', async () => {
    const { householdId, items } = await createPurchase([{ name: 'X', category: 'Potraviny', price: 100 }])
    try {
      await expect(setPurchaseItemExpenseSplits(householdId, items[0].id, Array.from({ length: 7 }, () => ({ category: 'Ostatní' as const, subcategory: null, amount: 100 / 7 })))).rejects.toThrow(InvalidExpenseSplitError)
      await expect(setPurchaseItemExpenseSplits(householdId, items[0].id, [{ category: 'Ostatní', subcategory: null, amount: 0 }])).rejects.toThrow(InvalidExpenseSplitError)
      await expect(setPurchaseItemExpenseSplits(householdId, items[0].id, [{ category: 'Bogus' as never, subcategory: null, amount: 100 }])).rejects.toThrow(InvalidExpenseCategoryError)
      await expect(setPurchaseItemExpenseSplits(householdId, items[0].id, [{ category: 'Ostatní', subcategory: 'Nájem nebo hypotéka', amount: 100 }])).rejects.toThrow(InvalidExpenseCategoryError)
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })

  it('clearing the split (an empty array) reverts to the automatic mapping', async () => {
    const { householdId, purchaseId, items } = await createPurchase([{ name: 'Dárek', category: 'Potraviny', price: 100 }])
    try {
      await setPurchaseItemExpenseSplits(householdId, items[0].id, [{ category: 'Ostatní', subcategory: 'Dárky', amount: 100 }])
      await setPurchaseItemExpenseSplits(householdId, items[0].id, [])
      const expenses = await db.query.expenses.findMany({ where: eq(schema.expenses.purchaseId, purchaseId) })
      expect(expenses.map((row) => [row.category, row.subcategory, Number(row.amount)])).toEqual([['Potraviny', null, 100]])
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })

  it('rejects an item that does not belong to the caller\'s household', async () => {
    const a = await createPurchase([{ name: 'X', category: 'Potraviny', price: 10 }])
    const b = await createPurchase([{ name: 'Y', category: 'Potraviny', price: 10 }])
    try {
      await expect(setPurchaseItemExpenseSplits(b.householdId, a.items[0].id, [{ category: 'Ostatní', subcategory: null, amount: 10 }])).rejects.toThrow(PurchaseNotFoundError)
      await expect(setPurchaseItemExpenseSplits(a.householdId, a.items[0].id, [{ category: 'Ostatní', subcategory: null, amount: 10 }])).resolves.toBeUndefined()
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, a.householdId))
      await db.delete(schema.households).where(eq(schema.households.id, b.householdId))
    }
  })

  it('an item with no known category (an old purchase) is left out of the recomputed split', async () => {
    const { householdId, purchaseId } = await createPurchase([{ name: 'Known', category: 'Potraviny', price: 40 }])
    try {
      const [unknown] = await db.insert(schema.purchaseItems).values({ purchaseId, name: 'Unknown', price: '10' }).returning() // no category
      await recomputePurchaseExpenses(db, purchaseId)
      const expenses = await db.query.expenses.findMany({ where: eq(schema.expenses.purchaseId, purchaseId) })
      // Only the known item's 40 Kč is split; the unknown item's 10 Kč is not invented into a category.
      expect(expenses.map((row) => Number(row.amount))).toEqual([40])
      await db.delete(schema.purchaseItems).where(eq(schema.purchaseItems.id, unknown.id))
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })

  describe('learning a product\'s reassignment (owner request, 2026-09-27)', () => {
    it('remembers a plain (one-target) reassignment for the product', async () => {
      const product = await createProduct()
      const { householdId, items } = await createPurchase([{ name: product.name, category: 'Potraviny', price: 100, productId: product.id }])
      try {
        await setPurchaseItemExpenseSplits(householdId, items[0].id, [{ category: 'Ostatní', subcategory: 'Dárky', amount: 100 }])
        expect(await getHouseholdProductExpenseDefaults(householdId, [product.id])).toEqual(new Map([[product.id, { category: 'Ostatní', subcategory: 'Dárky' }]]))
      } finally {
        await db.delete(schema.households).where(eq(schema.households.id, householdId))
        await db.delete(schema.products).where(eq(schema.products.id, product.id))
      }
    })

    it('does not remember a genuine, multi-way split as a repeating pattern', async () => {
      const product = await createProduct()
      const { householdId, items } = await createPurchase([{ name: product.name, category: 'Potraviny', price: 100, productId: product.id }])
      try {
        await setPurchaseItemExpenseSplits(householdId, items[0].id, [
          { category: 'Ostatní', subcategory: 'Dárky', amount: 60 },
          { category: 'Potraviny', subcategory: null, amount: 40 },
        ])
        expect(await getHouseholdProductExpenseDefaults(householdId, [product.id])).toEqual(new Map())
      } finally {
        await db.delete(schema.households).where(eq(schema.households.id, householdId))
        await db.delete(schema.products).where(eq(schema.products.id, product.id))
      }
    })

    it('forgets the default when the reassignment is cleared back to automatic', async () => {
      const product = await createProduct()
      const { householdId, items } = await createPurchase([{ name: product.name, category: 'Potraviny', price: 100, productId: product.id }])
      try {
        await setPurchaseItemExpenseSplits(householdId, items[0].id, [{ category: 'Ostatní', subcategory: 'Dárky', amount: 100 }])
        await setPurchaseItemExpenseSplits(householdId, items[0].id, [])
        expect(await getHouseholdProductExpenseDefaults(householdId, [product.id])).toEqual(new Map())
      } finally {
        await db.delete(schema.households).where(eq(schema.households.id, householdId))
        await db.delete(schema.products).where(eq(schema.products.id, product.id))
      }
    })

    it('applyLearnedExpenseDefaults pre-assigns a new item of a product with a remembered default, and writes its split', async () => {
      const product = await createProduct()
      const first = await createPurchase([{ name: product.name, category: 'Potraviny', price: 100, productId: product.id }])
      try {
        await setPurchaseItemExpenseSplits(first.householdId, first.items[0].id, [{ category: 'Ostatní', subcategory: 'Dárky', amount: 100 }])

        const [household2] = await db.insert(schema.households).values({ name: '__test_household_purchase_items__' }).returning()
        const [purchase2] = await db.insert(schema.purchases).values({ householdId: household2.id, date: '2026-09-27', total: '50' }).returning()
        const [item2] = await db
          .insert(schema.purchaseItems)
          .values({ purchaseId: purchase2.id, name: product.name, price: '50', category: 'Potraviny', productId: product.id })
          .returning()

        // A different household's own default (or lack of one) applies — not the first household's.
        const applied = await applyLearnedExpenseDefaults(db, household2.id, [{ id: item2.id, productId: product.id, price: item2.price, quantity: item2.quantity }])
        expect(applied.get(item2.id)).toEqual([])

        const appliedForFirst = await applyLearnedExpenseDefaults(db, first.householdId, [{ id: item2.id, productId: product.id, price: item2.price, quantity: item2.quantity }])
        expect(appliedForFirst.get(item2.id)).toEqual([{ category: 'Ostatní', subcategory: 'Dárky', amount: 50 }])
        const writtenSplit = await db.query.purchaseItemExpenseSplits.findFirst({ where: eq(schema.purchaseItemExpenseSplits.purchaseItemId, item2.id) })
        expect(writtenSplit).toMatchObject({ category: 'Ostatní', subcategory: 'Dárky' })

        await db.delete(schema.households).where(eq(schema.households.id, household2.id))
      } finally {
        await db.delete(schema.households).where(eq(schema.households.id, first.householdId))
        await db.delete(schema.products).where(eq(schema.products.id, product.id))
      }
    })
  })
})

describe('getPurchaseItemsForExpense', () => {
  it('lists the items behind a plain category (the automatic mapping), with their own amount', async () => {
    const { householdId, purchaseId } = await createPurchase([
      { name: 'Mléko', category: 'Potraviny', price: 40 },
      { name: 'Chleba', category: 'Potraviny', price: 30 },
      { name: 'Šampon', category: 'Drogerie', price: 60 },
    ])
    try {
      const items = await getPurchaseItemsForExpense(householdId, purchaseId, { category: 'Potraviny', subcategory: null })
      expect(items.map((item) => [item.name, item.matchedAmount]).sort()).toEqual([
        ['Chleba', 30],
        ['Mléko', 40],
      ])
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })

  it('shows only the matching part of an item split across more than one target', async () => {
    const { householdId, purchaseId, items } = await createPurchase([{ name: 'Oblečení', category: 'Potraviny', price: 1000 }])
    try {
      await setPurchaseItemExpenseSplits(householdId, items[0].id, [
        { category: 'Oblečení a obuv', subcategory: 'Oblečení', amount: 600 },
        { category: 'Děti', subcategory: 'Oblečení pro děti', amount: 400 },
      ])
      const forAdult = await getPurchaseItemsForExpense(householdId, purchaseId, { category: 'Oblečení a obuv', subcategory: 'Oblečení' })
      expect(forAdult).toMatchObject([{ name: 'Oblečení', matchedAmount: 600 }])
      const forChild = await getPurchaseItemsForExpense(householdId, purchaseId, { category: 'Děti', subcategory: 'Oblečení pro děti' })
      expect(forChild).toMatchObject([{ name: 'Oblečení', matchedAmount: 400 }])
      // Not one of this item's targets at all.
      expect(await getPurchaseItemsForExpense(householdId, purchaseId, { category: 'Potraviny', subcategory: null })).toEqual([])
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })

  it('rejects a purchase that does not belong to the caller\'s household', async () => {
    const a = await createPurchase([{ name: 'X', category: 'Potraviny', price: 10 }])
    const b = await createPurchase([{ name: 'Y', category: 'Potraviny', price: 10 }])
    try {
      await expect(getPurchaseItemsForExpense(b.householdId, a.purchaseId, { category: 'Potraviny', subcategory: null })).rejects.toThrow(PurchaseNotFoundError)
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, a.householdId))
      await db.delete(schema.households).where(eq(schema.households.id, b.householdId))
    }
  })
})

describe('recordPurchaseAsExpense (owner request, 2026-09-27: "zapsat do rozpočtu dodatečně")', () => {
  it('records a receipt-derived purchase with no expenses yet, using the automatic mapping', async () => {
    const { householdId, purchaseId } = await createUnrecordedPurchase([{ name: 'Mléko', category: 'Potraviny', price: 40 }], { fromReceipt: true })
    try {
      expect(await db.query.expenses.findMany({ where: eq(schema.expenses.purchaseId, purchaseId) })).toEqual([])
      await recordPurchaseAsExpense(householdId, purchaseId)
      const expenses = await db.query.expenses.findMany({ where: eq(schema.expenses.purchaseId, purchaseId) })
      expect(expenses).toMatchObject([{ category: 'Potraviny', subcategory: null, amount: '40.00' }])
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })

  it('refuses a purchase that did not come from a receipt', async () => {
    const { householdId, purchaseId } = await createUnrecordedPurchase([{ name: 'Mléko', category: 'Potraviny', price: 40 }])
    try {
      await expect(recordPurchaseAsExpense(householdId, purchaseId)).rejects.toThrow(NotFromReceiptError)
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })

  it('refuses a purchase that already has expenses', async () => {
    const { householdId, purchaseId } = await createPurchase([{ name: 'Mléko', category: 'Potraviny', price: 40 }])
    await db.insert(schema.receiptImports).values({ householdId, purchaseId, status: 'completed', source: 'manual' })
    try {
      await expect(recordPurchaseAsExpense(householdId, purchaseId)).rejects.toThrow(AlreadyRecordedError)
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })

  it('refuses a purchase whose items have no known category (older than migration 0042)', async () => {
    const { householdId, purchaseId } = await createUnrecordedPurchase([{ name: 'Neznámé', price: 40 }], { fromReceipt: true }) // no category
    try {
      await expect(recordPurchaseAsExpense(householdId, purchaseId)).rejects.toThrow(NothingToRecordError)
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })

  it('rejects a purchase that does not belong to the caller\'s household', async () => {
    const a = await createUnrecordedPurchase([{ name: 'X', category: 'Potraviny', price: 10 }], { fromReceipt: true })
    const b = await createUnrecordedPurchase([{ name: 'Y', category: 'Potraviny', price: 10 }], { fromReceipt: true })
    try {
      await expect(recordPurchaseAsExpense(b.householdId, a.purchaseId)).rejects.toThrow(PurchaseNotFoundError)
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, a.householdId))
      await db.delete(schema.households).where(eq(schema.households.id, b.householdId))
    }
  })
})
