import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { invalidateProductCatalogCache } from '@/lib/db/cache-invalidation'
import { upsertProductCatalogDefaults } from '@/lib/db/queries'
import { proposeProductCategory } from '@/lib/db/category-changes'
import { proposeProductSubcategory } from '@/lib/db/subcategory-changes'
import type { CatalogChangeOutcome, CategoryChangeOutcome } from '@/lib/product-subcategory-changes'
import { productTypeByKey } from '@/lib/product-types'
import { PRODUCT_SUBCATEGORIES, subcategoriesOfItem } from '@/lib/product-subcategories'
import { customPlaceIdFromKey, PANTRY_LOCATIONS, PANTRY_TRACKING } from '@/lib/pantry'
import { classifySubcategory } from '@/lib/categorization'
import type { ItemCategory, ItemUnit, PantryLocation, PantryTracking } from '@/lib/types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class PantryInputError extends Error {}
export class PantryResourceNotFoundError extends Error {}

export async function autoCategorizePantryForHousehold(householdId: string): Promise<{ id: string; subcategory: string }[]> {
  const db = getDb()
  const rows = await db.query.pantryItems.findMany({
    where: and(eq(schema.pantryItems.householdId, householdId), isNull(schema.pantryItems.subcategoryId)),
    columns: { id: true, name: true, category: true },
  })
  const assigned: { id: string; subcategory: string }[] = []
  const idCache = new Map<string, string>()
  for (const row of rows) {
    const match = classifySubcategory(row.category, row.name, null)
    if (!match) continue
    const cacheKey = `${row.category}:${match.subcategory}`
    let subcategoryId = idCache.get(cacheKey)
    if (!subcategoryId) {
      const subcategory = await db.query.productSubcategories.findFirst({
        where: and(eq(schema.productSubcategories.category, row.category), eq(schema.productSubcategories.name, match.subcategory)),
        columns: { id: true },
      })
      if (!subcategory) continue
      subcategoryId = subcategory.id
      idCache.set(cacheKey, subcategoryId)
    }
    const changed = await db.update(schema.pantryItems).set({ subcategoryId })
      .where(and(eq(schema.pantryItems.id, row.id), eq(schema.pantryItems.householdId, householdId), isNull(schema.pantryItems.subcategoryId)))
      .returning({ id: schema.pantryItems.id })
    if (changed.length) assigned.push({ id: row.id, subcategory: match.subcategory })
  }
  return assigned
}

export async function updatePantryItemForHousehold(
  householdId: string,
  pantryItemId: string,
  change:
    | { quantity: number; expectedQuantity?: number }
    | { placeKey: string }
    | { category: ItemCategory }
    | { subcategory: string | null }
    | { productTypeKey: string | null }
    | { tracking: PantryTracking }
    | { contentQuantity: { id: string; quantity: number } }
    | { contentPackage: { id: string; quantity: number | null; unit: ItemUnit | null } }
    | { packageSize: { quantity: number | null; unit: ItemUnit | null } },
): Promise<void | { categoryOutcome: CategoryChangeOutcome } | { subcategoryOutcome: CatalogChangeOutcome | 'none' } | { productTypeId: string | null }> {
  if (!UUID_PATTERN.test(pantryItemId)) throw new PantryResourceNotFoundError('Pantry item not found')
  // This quantity read drives compare-and-set. Use the dedicated cache-disabled Hyperdrive
  // binding so a write made by the same or another household member is visible immediately.
  const db = getDb('quantity' in change || 'contentQuantity' in change || 'contentPackage' in change || 'packageSize' in change ? 'HYPERDRIVE_PANTRY_FRESH' : 'HYPERDRIVE')
  const item = await db.query.pantryItems.findFirst({
    where: and(eq(schema.pantryItems.id, pantryItemId), eq(schema.pantryItems.householdId, householdId)),
    columns: { id: true, householdId: true, name: true, quantity: true, unit: true, category: true, productId: true, productTypeId: true, location: true, pieceQuantity: true, pieceUnit: true },
    with: { contents: { columns: { id: true, productId: true, name: true, quantity: true, pieceQuantity: true, pieceUnit: true } } },
  })
  if (!item) throw new PantryResourceNotFoundError('Pantry item not found')

  if ('quantity' in change) {
    if (!Number.isFinite(change.quantity) || change.quantity < 0) throw new PantryInputError('Množství nesmí být záporné.')
    if ((item.contents?.length ?? 0) > 0) throw new PantryInputError('Upravte množství jednotlivých produktů v detailu zásoby.')
    // Compare-and-set: when the caller says which amount it expected to find, the write only goes
    // through if that is still the stored amount. A request that was overtaken — a second tap, or
    // another member of the household — can then no longer overwrite the newer amount with an
    // older one. Callers that do not know the previous amount (the mobile API) are unaffected.
    if (change.expectedQuantity != null && Number(item.quantity) !== change.expectedQuantity) {
      throw new PantryInputError('Množství mezitím změnil někdo jiný. Zkontrolujte prosím aktuální stav a zkuste to znovu.')
    }
    const updateConditions = [eq(schema.pantryItems.id, pantryItemId), eq(schema.pantryItems.householdId, householdId)]
    if (change.expectedQuantity != null) updateConditions.push(eq(schema.pantryItems.quantity, change.expectedQuantity))
    const updated = await db
      .update(schema.pantryItems)
      .set({ quantity: change.quantity })
      .where(and(...updateConditions))
      .returning({ id: schema.pantryItems.id })
    // Keep the comparison atomic as well: another member may update after the fresh read but
    // before this write reaches PostgreSQL.
    if (change.expectedQuantity != null && updated.length === 0) {
      throw new PantryInputError('Množství mezitím změnil někdo jiný. Zkontrolujte prosím aktuální stav a zkuste to znovu.')
    }
    return
  }

  if ('category' in change) {
    const category = change.category
    if (!Object.prototype.hasOwnProperty.call(PRODUCT_SUBCATEGORIES, category)) throw new PantryInputError('Neplatná kategorie.')
    if (item.category === category) return { categoryOutcome: 'unchanged' }
    if (item.productId) {
      const outcome = await proposeProductCategory(householdId, item.productId, category)
      if (outcome === 'locked') return { categoryOutcome: outcome }
      await db.update(schema.pantryItems).set({ category, subcategoryId: null })
        .where(and(eq(schema.pantryItems.id, item.id), eq(schema.pantryItems.householdId, householdId)))
      return { categoryOutcome: outcome }
    }
    await db.update(schema.pantryItems).set({ category, subcategoryId: null })
      .where(and(eq(schema.pantryItems.id, item.id), eq(schema.pantryItems.householdId, householdId)))
    return { categoryOutcome: 'applied' }
  }

  if ('subcategory' in change) {
    const subcategory = change.subcategory
    if (subcategory !== null && !subcategoriesOfItem(item.category).includes(subcategory)) throw new PantryInputError('Neplatná podkategorie.')
    let subcategoryId: string | null = null
    if (subcategory !== null) {
      const row = await db.query.productSubcategories.findFirst({
        where: and(eq(schema.productSubcategories.category, item.category), eq(schema.productSubcategories.name, subcategory)),
        columns: { id: true },
      })
      if (!row) throw new PantryInputError('Neplatná podkategorie.')
      subcategoryId = row.id
    }
    await db.update(schema.pantryItems).set({ subcategoryId })
      .where(and(eq(schema.pantryItems.id, item.id), eq(schema.pantryItems.householdId, householdId)))
    const outcome = item.productId && subcategory !== null
      ? await proposeProductSubcategory(householdId, item.productId, item.category, subcategory)
      : 'none'
    return { subcategoryOutcome: outcome }
  }

  if ('productTypeKey' in change) {
    const key = change.productTypeKey
    if (key !== null && !productTypeByKey(key)) throw new PantryInputError('Neplatný druh produktu.')
    const selectedType = key ? await db.query.productTypes.findFirst({ where: eq(schema.productTypes.key, key), columns: { id: true, name: true } }) : null
    if (key && !selectedType) throw new PantryInputError('Neplatný druh produktu.')
    const productTypeId = selectedType?.id ?? null
    const typeStock = !item.productId && (item.productTypeId != null || item.contents.length > 0)
    await db.update(schema.pantryItems).set({
      productTypeId,
      ...(typeStock && selectedType ? { name: selectedType.name } : {}),
    }).where(and(eq(schema.pantryItems.id, item.id), eq(schema.pantryItems.householdId, householdId)))
    const productIds = [...new Set([item.productId, ...item.contents.map((content) => content.productId)].filter((id): id is string => id != null))]
    if (productIds.length > 0) {
      const products = await db.query.products.findMany({ where: inArray(schema.products.id, productIds), columns: { id: true, productTypeId: true } })
      for (const product of products) {
        await db.update(schema.products).set({
          productTypeId,
          productTypeSource: 'manual',
          ...(product.productTypeId !== productTypeId ? { productSubtypeId: null, productSubtypeSource: null } : {}),
        }).where(eq(schema.products.id, product.id))
      }
      invalidateProductCatalogCache()
    } else if (!item.productId && !item.productTypeId && item.contents.length === 0) {
      const productId = await upsertProductCatalogDefaults({ name: item.name, category: item.category, unit: item.unit, location: item.location, productTypeKey: key })
      if (productId) await db.update(schema.pantryItems).set({ productId }).where(eq(schema.pantryItems.id, item.id))
    }
    return { productTypeId }
  }

  if ('tracking' in change) {
    if (!PANTRY_TRACKING.some((option) => option.value === change.tracking)) throw new PantryInputError('Neplatná volba sledování.')
    await db.update(schema.pantryItems).set({ tracking: change.tracking, askedAt: null })
      .where(and(eq(schema.pantryItems.id, item.id), eq(schema.pantryItems.householdId, householdId)))
    return
  }

  if ('contentQuantity' in change) {
    const { id, quantity } = change.contentQuantity
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000) throw new PantryInputError('Množství musí být číslo od 0 do 1 000 000.')
    const content = item.contents.find((entry) => entry.id === id)
    if (!content) throw new PantryResourceNotFoundError('Pantry content not found')
    await db.update(schema.pantryItemContents).set({ quantity }).where(and(eq(schema.pantryItemContents.id, id), eq(schema.pantryItemContents.pantryItemId, item.id)))
    const totals = await db.select({ quantity: sql<number>`coalesce(sum(${schema.pantryItemContents.quantity}), 0)` })
      .from(schema.pantryItemContents).where(eq(schema.pantryItemContents.pantryItemId, item.id))
    await db.update(schema.pantryItems).set({ quantity: Number(totals[0]?.quantity ?? 0), addedAt: new Date(), askedAt: null })
      .where(and(eq(schema.pantryItems.id, item.id), eq(schema.pantryItems.householdId, householdId)))
    return
  }

  if ('contentPackage' in change) {
    const { id, quantity, unit } = change.contentPackage
    if (!item.contents.some((entry) => entry.id === id)) throw new PantryResourceNotFoundError('Pantry content not found')
    if ((quantity === null) !== (unit === null) || (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000))) {
      throw new PantryInputError('Zadejte kladnou velikost balení a jednotku, nebo obě hodnoty vymažte.')
    }
    if (unit !== null && !(['kg', 'g', 'l', 'ml', 'dávka'] as string[]).includes(unit)) throw new PantryInputError('Neplatná jednotka balení.')
    await db.update(schema.pantryItemContents).set({ pieceQuantity: quantity, pieceUnit: unit })
      .where(and(eq(schema.pantryItemContents.id, id), eq(schema.pantryItemContents.pantryItemId, item.id)))
    return
  }

  if ('packageSize' in change) {
    const { quantity, unit } = change.packageSize
    if (item.unit !== 'ks' || item.contents.length > 0) throw new PantryInputError('Velikost balení lze upravit pouze u samostatné položky počítané v kusech.')
    if ((quantity === null) !== (unit === null) || (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000))) {
      throw new PantryInputError('Zadejte kladné množství balení a jednotku, nebo obě hodnoty vymažte.')
    }
    if (unit !== null && !(['kg', 'g', 'l', 'ml', 'dávka'] as string[]).includes(unit)) throw new PantryInputError('Neplatná jednotka balení.')
    await db.update(schema.pantryItems).set({ pieceQuantity: quantity, pieceUnit: unit })
      .where(and(eq(schema.pantryItems.id, item.id), eq(schema.pantryItems.householdId, householdId)))
    return
  }

  const customPlaceId = customPlaceIdFromKey(change.placeKey)
  if (customPlaceId) {
    if (!UUID_PATTERN.test(customPlaceId)) throw new PantryInputError('Vlastní místo nenalezeno.')
    const place = await db.query.pantryPlaces.findFirst({
      where: and(eq(schema.pantryPlaces.id, customPlaceId), eq(schema.pantryPlaces.householdId, householdId)),
      columns: { id: true },
    })
    if (!place) throw new PantryInputError('Vlastní místo nenalezeno.')
    await db
      .update(schema.pantryItems)
      .set({ customPlaceId })
      .where(and(eq(schema.pantryItems.id, pantryItemId), eq(schema.pantryItems.householdId, householdId)))
    return
  }

  if (!(PANTRY_LOCATIONS as string[]).includes(change.placeKey)) throw new PantryInputError('Neplatné umístění.')
  await db
    .update(schema.pantryItems)
    .set({ location: change.placeKey as PantryLocation, customPlaceId: null })
    .where(and(eq(schema.pantryItems.id, pantryItemId), eq(schema.pantryItems.householdId, householdId)))
}
