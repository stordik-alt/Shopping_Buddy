import { ITEM_UNITS } from '@/lib/units'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { getHouseholdExpenses, getHouseholdNotifications, getPantryItems, linkPantryContentsToProduct, restockPantryItem, restockPantryTypeItem, upsertProductCatalogDefaults } from '@/lib/db/queries'
import { stockTypesForLines } from '@/lib/db/stock-types'
import { pieceSizeOf } from '@/lib/piece-size'
import { getProductCatalogCached, getSubcategoryCatalogCached } from '@/lib/db/cached-reads'
import { purchasedInventoryQuantities } from '@/lib/inventory-packaging'
import { recomputePurchaseExpenses } from '@/lib/db/purchase-items'
import { matchProductByName } from '@/lib/products'
import { isValidProductSubcategory } from '@/lib/product-subcategories'
import { inferPantryLocation } from '@/lib/pantry'
import type { Expense, ItemCategory, ItemUnit, ManualPurchaseInput, Notification, PantryItem, PurchaseRecord } from '@/lib/types'

const PRODUCT_ITEM_CATEGORIES = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní'] as const
export class ManualPurchaseInputError extends Error {}

/** Shared purchase creation used by the PWA action and the bearer-authenticated Expo endpoint. */
export async function createManualPurchaseForHousehold(
  householdId: string,
  input: ManualPurchaseInput,
): Promise<{ purchase: PurchaseRecord; expenses: Expense[]; notifications: Notification[]; pantryItems: PantryItem[] }> {
  if (!input || typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new ManualPurchaseInputError('Neplatné datum nákupu.')
  if (!Array.isArray(input.items) || input.items.length === 0) throw new ManualPurchaseInputError('Nákup musí obsahovat alespoň jednu položku.')
  if (input.items.length > 100) throw new ManualPurchaseInputError('Nákup může obsahovat nejvýše 100 položek.')

  const items = input.items.map((item, index) => {
    const name = String(item.name ?? '').trim()
    const quantity = Number(item.quantity)
    const price = Number(item.price)
    if (!name) throw new ManualPurchaseInputError(`Položka ${index + 1} nemá název.`)
    if (!Number.isFinite(quantity) || quantity <= 0) throw new ManualPurchaseInputError(`Neplatné množství u položky „${name}“.`)
    if (!Number.isFinite(price) || price < 0) throw new ManualPurchaseInputError(`Neplatná cena u položky „${name}“.`)
    if (!(ITEM_UNITS as string[]).includes(item.unit)) throw new ManualPurchaseInputError(`Neplatná jednotka u položky „${name}“.`)
    if (!(PRODUCT_ITEM_CATEGORIES as readonly string[]).includes(item.category)) throw new ManualPurchaseInputError(`Neplatná kategorie u položky „${name}“.`)
    if (item.subcategory != null && !isValidProductSubcategory(item.category, item.subcategory)) throw new ManualPurchaseInputError(`Neplatná podkategorie u položky „${name}“.`)
    return { name, quantity, price, unit: item.unit, category: item.category, subcategory: item.subcategory ?? null }
  })

  const catalog = await getProductCatalogCached(items.map((item) => item.name))
  const resolved = items.map((item) => {
    const product = matchProductByName(catalog, item.name)
    const category = item.category
    const subcategory = item.subcategory ?? null
    if (!isValidProductSubcategory(category, subcategory)) throw new ManualPurchaseInputError(`Neplatná podkategorie u položky „${item.name}“.`)
    return { ...item, product, category, subcategory }
  })
  const subcategories = await getSubcategoryCatalogCached()
  const subcategoryId = (category: ItemCategory, name: string | null) => name ? subcategories.find((row) => row.category === category && row.name === name)?.id ?? null : null

  const db = getDb()
  let storeLocationId: string | null = null
  if (input.storeChain?.trim()) {
    const store = await db.query.stores.findFirst({ where: eq(schema.stores.chain, input.storeChain.trim()) })
    if (store) {
      const location = await db.query.storeLocations.findFirst({ where: eq(schema.storeLocations.storeId, store.id) })
      storeLocationId = location?.id ?? null
    }
  }

  const subtotal = resolved.reduce((sum, item) => sum + item.quantity * item.price, 0)
  const discount = input.discount == null ? null : Number(input.discount)
  if (discount != null && (!Number.isFinite(discount) || discount < 0 || discount > subtotal)) throw new ManualPurchaseInputError('Neplatná sleva.')
  const total = Math.max(0, subtotal - (discount ?? 0))

  const [purchaseRow] = await db.insert(schema.purchases).values({
    householdId,
    storeLocationId,
    date: input.date,
    total: total.toFixed(2),
    discount: discount?.toFixed(2),
  }).returning()

  const itemRows = await db.insert(schema.purchaseItems).values(
    resolved.map((item) => ({
      purchaseId: purchaseRow.id,
      productId: item.product?.id ?? null,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      price: item.price.toFixed(2),
      category: item.category,
      subcategoryId: subcategoryId(item.category, item.subcategory),
    })),
  ).returning()

  const inventoryInputs = resolved.map((item) => ({
    productId: item.product?.id ?? null,
    name: item.name,
    subcategory: item.subcategory,
    quantity: item.quantity,
    unit: item.unit,
  }))
  const inventoryQuantities = await purchasedInventoryQuantities(inventoryInputs)
  // Stock is kept by product type, like a receipt import; a line whose type cannot be told is stocked under its own name.
  const lineTypes = await stockTypesForLines(resolved.map((item) => ({ productId: item.product?.id ?? null, name: item.name, category: item.category })))
  for (const [index, item] of resolved.entries()) {
    if (!item.product?.isNonInventory) {
      const inventory = inventoryQuantities[index]
      const type = lineTypes[index]
      if (type) {
        await restockPantryTypeItem(householdId, {
          productTypeId: type.id,
          typeName: type.name,
          productId: item.product?.id ?? null,
          productName: item.name,
          category: item.category,
          quantity: inventory.quantity,
          unit: inventory.unit,
          subcategoryId: subcategoryId(item.category, item.subcategory),
          piece: pieceSizeOf(inventory, item.name),
        })
      } else {
        await restockPantryItem(householdId, {
          productId: item.product?.id ?? null,
          name: item.name,
          category: item.category,
          quantity: inventory.quantity,
          unit: inventory.unit,
          subcategoryId: subcategoryId(item.category, item.subcategory),
        })
      }
    }
    // A manual import is a human-confirmed classification, so remember it for future imports too.
    const productId = await upsertProductCatalogDefaults({
      name: item.name,
      category: item.category,
      unit: item.unit,
      location: item.product?.defaultLocation ?? inferPantryLocation(item.category, item.name) ?? 'Spíž',
      subcategory: item.subcategory,
      isNonInventory: item.product?.isNonInventory,
    })
    if (productId) await linkPantryContentsToProduct(householdId, item.name, productId)
  }

  const note = input.storeChain?.trim() ? `Nákup ${input.storeChain.trim()} (ručně)` : 'Nákup (ručně)'
  await recomputePurchaseExpenses(db, purchaseRow.id, { notifyBudget: true, noteForNewPurchase: note })

  const [expenses, notifications, pantryItems] = await Promise.all([
    getHouseholdExpenses(householdId),
    getHouseholdNotifications(householdId),
    getPantryItems(householdId),
  ])

  return {
    purchase: {
      id: purchaseRow.id,
      date: purchaseRow.date,
      store: input.storeChain?.trim() || undefined,
      total: Number(purchaseRow.total),
      discount: purchaseRow.discount != null ? Number(purchaseRow.discount) : undefined,
      items: itemRows.map((row) => ({
        id: row.id,
        name: row.name,
        quantity: Number(row.quantity),
        unit: row.unit,
        price: Number(row.price),
        category: row.category,
        expenseSplits: [],
      })),
    },
    expenses,
    notifications,
    pantryItems,
  }
}
