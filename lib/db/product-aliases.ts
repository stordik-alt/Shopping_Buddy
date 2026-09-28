// DB access for `product_aliases` (schema.ts) — kept separate from the pure matching logic in
// lib/categorization.ts (CLAUDE.md section 6: business logic outside UI/data-access layers, and
// testable without a database). Two operations: fetch the candidates a batch of receipt lines could
// plausibly match, and record a learned alias when a household corrects a recognition (spec section
// 12, "user corrections must teach the system").

import { eq, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { normalizeProductText } from '@/lib/product-normalize'
import type { ProductAliasEntry } from '@/lib/categorization'

/** Alias rows whose normalized text is one of `normalizedNames` — the same "only the candidates
 *  this batch could need" shape as `getProductCatalog(names)`, so matching a whole receipt never
 *  reads the entire alias table. */
export async function getAliasesForNames(normalizedNames: string[]): Promise<ProductAliasEntry[]> {
  if (normalizedNames.length === 0) return []
  const db = getDb()
  const rows = await db
    .select({ productId: schema.productAliases.productId, storeId: schema.productAliases.storeId, normalizedAlias: schema.productAliases.normalizedAlias, confidence: schema.productAliases.confidence })
    .from(schema.productAliases)
    .where(inArray(schema.productAliases.normalizedAlias, [...new Set(normalizedNames)]))
  return rows.map((row) => ({ productId: row.productId, storeId: row.storeId, normalizedAlias: row.normalizedAlias, confidence: Number(row.confidence) }))
}

/** Records (or strengthens) a household's correction as a reusable alias — global when no store is
 *  known, store-specific otherwise, per spec section 6/12. `ON CONFLICT` on the
 *  (product, store, normalized alias) unique index means a repeated identical correction just
 *  refreshes `updatedAt`/confidence instead of creating duplicate rows (CLAUDE.md section 34:
 *  idempotent). A correction always writes with full confidence (1.0) and `source: 'user_correction'`
 *  — the whole point is that a human just confirmed it, which outranks every automatic tier. */
export async function recordProductAlias(input: { productId: string; storeId: string | null; alias: string; source?: string; confidence?: number }): Promise<void> {
  const alias = input.alias.trim()
  const normalizedAlias = normalizeProductText(alias)
  if (!alias || !normalizedAlias) return
  const db = getDb()
  await db
    .insert(schema.productAliases)
    .values({
      productId: input.productId,
      storeId: input.storeId,
      alias,
      normalizedAlias,
      source: input.source ?? 'user_correction',
      confidence: (input.confidence ?? 1).toFixed(3),
    })
    .onConflictDoUpdate({
      target: [schema.productAliases.productId, schema.productAliases.storeId, schema.productAliases.normalizedAlias],
      set: { alias, source: input.source ?? 'user_correction', confidence: (input.confidence ?? 1).toFixed(3), updatedAt: new Date() },
    })
}

/** Every alias (global or for `storeId`) pointing at `productId` — used only by tests/debugging
 *  tools that need to see what the system has "learned" for one product; not on any hot path. */
export async function getAliasesForProduct(productId: string): Promise<ProductAliasEntry[]> {
  const db = getDb()
  const rows = await db
    .select({ productId: schema.productAliases.productId, storeId: schema.productAliases.storeId, normalizedAlias: schema.productAliases.normalizedAlias, confidence: schema.productAliases.confidence })
    .from(schema.productAliases)
    .where(eq(schema.productAliases.productId, productId))
  return rows.map((row) => ({ productId: row.productId, storeId: row.storeId, normalizedAlias: row.normalizedAlias, confidence: Number(row.confidence) }))
}
