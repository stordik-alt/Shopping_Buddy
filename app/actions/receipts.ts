'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { TODAY } from '@/lib/budget'
import { getDb } from '@/lib/db/client'
import { getProductCatalog, restockPantryItem } from '@/lib/db/queries'
import * as schema from '@/lib/db/schema'
import { matchProductByName } from '@/lib/products'
import { receiptTotal, type ReceiptLineItem } from '@/lib/receipts'
import type { PurchaseRecord } from '@/lib/types'

/** Turns a manually-entered (or, once a real OCR provider exists per lib/receipts.ts, human-
 *  reviewed) receipt into a real purchase — same downstream effect as `completePurchaseAction`
 *  (app/actions/purchases.ts): one purchases/purchase_items row set, plus pantry restocking. Also
 *  keeps a `receipt_imports` record so a future OCR provider's output stays auditable/
 *  reprocessable, extending CLAUDE.md section 16's price/deal provenance rule to purchases too. */
export async function importReceiptAction(
  items: ReceiptLineItem[],
  options: { date?: string; storeLocationId?: string } = {},
): Promise<{ purchase: PurchaseRecord }> {
  const householdId = await requireHouseholdId()
  if (items.length === 0) throw new Error('Receipt has no items')
  const db = getDb()
  const date = options.date ?? TODAY

  const catalog = await getProductCatalog()
  const resolvedItems = items.map((item) => ({ ...item, productId: matchProductByName(catalog, item.name)?.id ?? null }))

  const total = receiptTotal(resolvedItems)
  const [purchaseRow] = await db
    .insert(schema.purchases)
    .values({ householdId, storeLocationId: options.storeLocationId, date, total: total.toString() })
    .returning()

  const itemRows = await db
    .insert(schema.purchaseItems)
    .values(
      resolvedItems.map((item) => ({
        purchaseId: purchaseRow.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        price: item.price.toString(),
      })),
    )
    .returning()

  for (const item of resolvedItems) {
    await restockPantryItem(householdId, { productId: item.productId, name: item.name, category: item.category, quantity: item.quantity, unit: item.unit })
  }

  const storeLocation = options.storeLocationId
    ? await db.query.storeLocations.findFirst({ where: eq(schema.storeLocations.id, options.storeLocationId), with: { store: true } })
    : null

  await db.insert(schema.receiptImports).values({
    householdId,
    status: 'imported',
    storeLocationId: options.storeLocationId,
    date,
    source: 'manual',
    items: JSON.stringify(items),
    purchaseId: purchaseRow.id,
    processedAt: new Date(),
  })

  revalidatePath('/')
  return {
    purchase: {
      id: purchaseRow.id,
      date: purchaseRow.date,
      store: storeLocation?.store.chain,
      total: Number(purchaseRow.total),
      items: itemRows.map((row) => ({ name: row.name, quantity: row.quantity, unit: row.unit, price: Number(row.price) })),
    },
  }
}
