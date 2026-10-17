'use server'

import { eq, inArray } from 'drizzle-orm'
import { checkRequiredText, LIST_NAME_MAX } from '@/lib/shopping-input'
import { requireHousehold, requireHouseholdId } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import { getProductCatalogCached } from '@/lib/db/cached-reads'
import { getShoppingListState } from '@/lib/db/queries'
import * as schema from '@/lib/db/schema'
import { canonicalPackageUnit } from '@/lib/recipes/packaging'
import type { CatalogPackage } from '@/lib/recipes/packaging'
import type { Item, Notification } from '@/lib/types'
import {
  addShoppingItemForHousehold,
  toggleShoppingItemForHousehold,
  updateShoppingItemForHousehold,
  type ShoppingItemChanges,
} from '@/lib/shopping-list-service'

export async function resolveRecipePackageHintsAction(names: string[]): Promise<Record<string, CatalogPackage[]>> {
  await requireHouseholdId()
  const uniqueNames = [...new Set(names.map((name) => name.trim()).filter(Boolean))].slice(0, 100)
  if (uniqueNames.length === 0) return {}
  const catalog = await getProductCatalogCached(uniqueNames)
  const byName = new Map(catalog.map((product) => [product.name.trim().toLocaleLowerCase(), product]))
  const productIds = [...new Set(catalog.map((product) => product.id))]
  if (productIds.length === 0) return {}
  const db = getDb()
  const rows = await db.query.productPackages.findMany({
    where: inArray(schema.productPackages.productId, productIds),
    columns: { productId: true, quantity: true, unit: true },
  })
  const packagesByProduct = new Map<string, CatalogPackage[]>()
  for (const row of rows) {
    const unit = canonicalPackageUnit(row.unit)
    if (!unit) continue
    const quantity = row.unit === 'g' || row.unit === 'ml' ? Number(row.quantity) / 1000 : Number(row.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) continue
    const list = packagesByProduct.get(row.productId) ?? []
    list.push({ quantity, unit })
    packagesByProduct.set(row.productId, list)
  }
  const hints: Record<string, CatalogPackage[]> = {}
  for (const name of uniqueNames) {
    const product = byName.get(name.toLocaleLowerCase())
    const packages = product ? packagesByProduct.get(product.id) ?? [] : []
    if (packages.length > 0) hints[name] = packages
  }
  return hints
}

export async function addShoppingItemAction(
  listId: string,
  name: string,
  overrides: Partial<Pick<Item, 'detail' | 'category' | 'unit' | 'quantity'>> = {},
  clientId?: string,
  selection?: { kind: 'product'; productId: string } | { kind: 'type'; productTypeKey: string },
): Promise<{ item: Item; notification: Notification | null }> {
  const { householdId, userId } = await requireHousehold()
  return addShoppingItemForHousehold(householdId, userId, listId, name, overrides, clientId, selection)
}

export async function updateShoppingItemAction(itemId: string, changes: ShoppingItemChanges) {
  return updateShoppingItemForHousehold(await requireHouseholdId(), itemId, changes)
}

export async function toggleShoppingItemAction(itemId: string, done: boolean) {
  return toggleShoppingItemForHousehold(await requireHouseholdId(), itemId, done)
}

export async function removeShoppingItemAction(itemId: string) {
  const householdId = await requireHouseholdId()
  const item = await getDb().query.shoppingListItems.findFirst({
    where: eq(schema.shoppingListItems.id, itemId),
    with: { list: true },
  })
  if (!item || item.list.householdId !== householdId) throw new Error('Shopping list item not found')
  await getDb().delete(schema.shoppingListItems).where(eq(schema.shoppingListItems.id, itemId))
}

export async function refreshShoppingListAction(): Promise<{ items: Item[]; shoppingLists: string[] }> {
  return getShoppingListState(await requireHouseholdId())
}

export async function addShoppingListAction(name: string) {
  const householdId = await requireHouseholdId()
  checkRequiredText(name, 'Název seznamu', LIST_NAME_MAX)
  await getDb().insert(schema.shoppingLists).values({ householdId, name })
}
