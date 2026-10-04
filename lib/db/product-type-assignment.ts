// Assigning product types (druhy zboží) to catalog products — docs/12_PRODUCT_TYPES.md, phase 1.
//
// The rules are lib/product-types.ts; this is the database side. A product's type is written with
// `product_type_source = 'rule'` and re-evaluated whenever the rules change (run
// `pnpm db:assign-product-types`); one set by a person ('manual') or taken over from a confirmed
// receipt match ('alias') is never touched here. A product the rules place nowhere, or in more than
// one type, has none — it is never offered automatically for a type.

import { and, eq, inArray, isNull, or, type SQL } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { classifyProductType } from '@/lib/product-types'
import type { ItemCategory } from '@/lib/types'

const CHUNK = 1000

/** product_types.key → id. */
export async function loadProductTypeIds(): Promise<Map<string, string>> {
  const rows = await getDb().select({ id: schema.productTypes.id, key: schema.productTypes.key }).from(schema.productTypes)
  return new Map(rows.map((row) => [row.key, row.id]))
}

/** The type id a new product named `name` in `category` gets, or null. For product creation paths
 *  (ingestion, receipts), which then store it with source 'rule'. A type missing from the database
 *  (code ahead of the migration) gives null rather than an error: the backfill fills it later. */
export function productTypeIdFor(category: ItemCategory, name: string, typeIds: Map<string, string>): string | null {
  const key = classifyProductType(category, name)
  return key ? typeIds.get(key) ?? null : null
}

export type ProductTypeMove = { id: string; name: string; category: ItemCategory; from: string | null; to: string | null }

/** What the rules would change. Read-only. Only products whose type is unset or rule-made are
 *  considered. `productIds` limits it (tests). */
export async function planProductTypeAssignment(options: { productIds?: string[] } = {}): Promise<ProductTypeMove[]> {
  const db = getDb()
  const typeIds = await loadProductTypeIds()
  const keyById = new Map([...typeIds].map(([key, id]) => [id, key]))
  const rows = await db.query.products.findMany({
    where: and(
      or(isNull(schema.products.productTypeSource), eq(schema.products.productTypeSource, 'rule')),
      options.productIds ? inArray(schema.products.id, options.productIds) : undefined,
    ),
    columns: { id: true, name: true, productTypeId: true },
    with: { category: { columns: { name: true } } },
  })
  const moves: ProductTypeMove[] = []
  for (const row of rows) {
    const to = productTypeIdFor(row.category.name, row.name, typeIds)
    if (to === row.productTypeId) continue
    moves.push({
      id: row.id,
      name: row.name,
      category: row.category.name,
      from: row.productTypeId ? keyById.get(row.productTypeId) ?? null : null,
      to: to ? keyById.get(to) ?? null : null,
    })
  }
  return moves
}

/** Applies a plan. Each UPDATE re-checks that the row is still unset or rule-made and still has the
 *  type the plan saw, so a person's correction made in between is never overwritten. Returns how many
 *  products changed. */
export async function applyProductTypeAssignment(moves: ProductTypeMove[]): Promise<number> {
  const db = getDb()
  const typeIds = await loadProductTypeIds()
  const idOf = (key: string | null) => (key ? typeIds.get(key) ?? null : null)
  const groups = new Map<string, { from: string | null; to: string | null; ids: string[] }>()
  for (const move of moves) {
    const key = `${move.from ?? ''}|${move.to ?? ''}`
    const group = groups.get(key) ?? { from: move.from, to: move.to, ids: [] }
    group.ids.push(move.id)
    groups.set(key, group)
  }
  let updated = 0
  for (const group of groups.values()) {
    const fromId = idOf(group.from)
    const sameType: SQL = fromId ? eq(schema.products.productTypeId, fromId) : isNull(schema.products.productTypeId)
    for (let i = 0; i < group.ids.length; i += CHUNK) {
      const toId = idOf(group.to)
      const rows = await db
        .update(schema.products)
        .set({ productTypeId: toId, productTypeSource: toId ? 'rule' : null })
        .where(
          and(
            inArray(schema.products.id, group.ids.slice(i, i + CHUNK)),
            or(isNull(schema.products.productTypeSource), eq(schema.products.productTypeSource, 'rule')),
            sameType,
          ),
        )
        .returning({ id: schema.products.id })
      updated += rows.length
    }
  }
  return updated
}
