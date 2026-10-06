// Moves catalog products to the item category their brand gives (lib/product-brands.ts, owner
// request 2026-10-06): Jupík, Kubík and Yess to Děti ▸ Dětské nápoje, HiPP and Sunar food from
// Potraviny to Děti, a toothpaste misfiled under Potraviny to Drogerie. New products already get the
// brand's category when they are created; this is for the ones created before.
//
// Never touched: a product whose category an administrator decided (`category_locked`) or a
// household changed by hand (an applied or approved row in `product_category_changes`) — a human
// decision outranks a brand rule. A moved product gets the subcategory the rules give it in the new
// category (or none), its purchase lines follow it (`syncProductClassificationToPurchases`, which
// also recomputes the budget split), and so do the pantry rows that sat in the product's old
// category; a pantry row a household placed elsewhere keeps its place.
//
// Preview first, then apply (CLAUDE.md section 7: no data change without a dry run). Every UPDATE
// re-checks the category the plan saw, so a row changed in between is skipped.

import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { syncProductClassificationToPurchases } from '@/lib/db/purchase-items'
import * as schema from '@/lib/db/schema'
import { brandOf } from '@/lib/product-brands'
import { normalizeProductText } from '@/lib/product-normalize'
import { classifySubcategoryByKeyword } from '@/lib/product-subcategories'
import type { ItemCategory } from '@/lib/types'

const CHUNK = 1000

export type BrandCategoryMove = { id: string; name: string; brand: string; from: ItemCategory; to: ItemCategory; subcategory: string | null }

/** Limits a run to these products (tests use it; the script runs on everything). */
export type BrandCategoryScope = { productIds?: string[] }

/** What would move. Read-only. */
export async function planBrandCategoryMoves(scope: BrandCategoryScope = {}): Promise<BrandCategoryMove[]> {
  const db = getDb()
  const products = await db.query.products.findMany({
    where: and(eq(schema.products.categoryLocked, false), scope.productIds ? inArray(schema.products.id, scope.productIds) : undefined),
    columns: { id: true, name: true },
    with: { category: { columns: { name: true } } },
  })
  const candidates = products.flatMap((product) => {
    const normalized = normalizeProductText(product.name)
    const brand = brandOf(normalized)
    if (!brand || brand.category === product.category.name) return []
    return [{ id: product.id, name: product.name, brand: brand.brand, from: product.category.name, to: brand.category, subcategory: classifySubcategoryByKeyword(brand.category, normalized) }]
  })
  if (candidates.length === 0) return []
  const decided = await db
    .selectDistinct({ productId: schema.productCategoryChanges.productId })
    .from(schema.productCategoryChanges)
    .where(and(inArray(schema.productCategoryChanges.productId, candidates.map((move) => move.id)), inArray(schema.productCategoryChanges.status, ['applied', 'approved'])))
  const byHand = new Set(decided.map((row) => row.productId))
  return candidates.filter((move) => !byHand.has(move.id))
}

/** Applies a plan from `planBrandCategoryMoves()`. Returns how many rows changed. */
export async function applyBrandCategoryMoves(moves: BrandCategoryMove[]): Promise<{ products: number; pantryItems: number; productsWithPurchases: number }> {
  const db = getDb()
  const categories = await db.query.productCategories.findMany({ columns: { id: true, name: true } })
  const subcategories = await db.query.productSubcategories.findMany({ columns: { id: true, category: true, name: true } })
  const categoryId = (name: ItemCategory) => {
    const id = categories.find((row) => row.name === name)?.id
    if (!id) throw new Error(`Unknown category ${name}`)
    return id
  }
  const subcategoryId = (category: ItemCategory, name: string | null) => {
    if (name == null) return null
    const id = subcategories.find((row) => row.category === category && row.name === name)?.id
    if (!id) throw new Error(`Unknown subcategory ${category} ▸ ${name}`)
    return id
  }

  // One UPDATE per (from, to, subcategory) and CHUNK products — every round trip keeps the Neon
  // compute busy.
  const groups = new Map<string, BrandCategoryMove[]>()
  for (const move of moves) {
    const key = `${move.from}|${move.to}|${move.subcategory ?? ''}`
    groups.set(key, [...(groups.get(key) ?? []), move])
  }
  const moved: BrandCategoryMove[] = []
  for (const group of groups.values()) {
    const { from, to, subcategory } = group[0]
    for (let i = 0; i < group.length; i += CHUNK) {
      const chunk = group.slice(i, i + CHUNK)
      const rows = await db
        .update(schema.products)
        .set({ categoryId: categoryId(to), subcategoryId: subcategoryId(to, subcategory) })
        .where(and(inArray(schema.products.id, chunk.map((move) => move.id)), eq(schema.products.categoryId, categoryId(from)), eq(schema.products.categoryLocked, false)))
        .returning({ id: schema.products.id })
      const done = new Set(rows.map((row) => row.id))
      moved.push(...chunk.filter((move) => done.has(move.id)))
    }
  }
  if (moved.length === 0) return { products: 0, pantryItems: 0, productsWithPurchases: 0 }

  const movedIds = new Set(moved.map((move) => move.id))
  let pantryItems = 0
  for (const group of groups.values()) {
    const { from, to, subcategory } = group[0]
    const ids = group.map((move) => move.id).filter((id) => movedIds.has(id))
    for (let i = 0; i < ids.length; i += CHUNK) {
      const rows = await db
        .update(schema.pantryItems)
        .set({ category: to, subcategoryId: subcategoryId(to, subcategory) })
        .where(and(inArray(schema.pantryItems.productId, ids.slice(i, i + CHUNK)), eq(schema.pantryItems.category, from)))
        .returning({ id: schema.pantryItems.id })
      pantryItems += rows.length
    }
  }

  // Purchase lines: only products that have any go through the (per-product) sync.
  const withPurchases = await db
    .selectDistinct({ productId: schema.purchaseItems.productId })
    .from(schema.purchaseItems)
    .where(inArray(schema.purchaseItems.productId, moved.map((move) => move.id)))
  for (const row of withPurchases) if (row.productId) await syncProductClassificationToPurchases(row.productId)

  return { products: moved.length, pantryItems, productsWithPurchases: withPurchases.length }
}
