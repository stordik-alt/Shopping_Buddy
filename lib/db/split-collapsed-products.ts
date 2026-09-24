import { and, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { distinctProductName } from '@/lib/products'

// One-off data repair for the product-identity bug fixed in `resolveProductForSku()`: before the fix,
// several SKUs of the same retailer that shared a name (Penny's flavours of "Raw tyčinka Crip Crop",
// Lidl's sizes of "Olivový olej extra panenský") were linked to ONE catalog product, mixing their
// prices and overwriting each other's promotions. This gives every such SKU but one its own product,
// named "<name> (<SKU>)" exactly as the fixed resolver would have created it, and moves that SKU's
// official price observations across. Nothing is deleted.

export type CollapsedGroup = {
  productId: string
  productName: string
  source: string
  /** SKU that stays on the original product (the smallest, so the choice is deterministic). */
  keep: string
  /** SKUs that get their own product. */
  split: { refId: string; externalId: string; newName: string }[]
}

export type SplitReport = {
  groups: CollapsedGroup[]
  applied: boolean
  productsCreated: number
  refsMoved: number
  pricesMoved: number
  /** Active deals still attached to an original product; they are left alone (see below). */
  dealsOnOriginals: number
}

/** Finds products that a single source links to more than one SKU and, when `apply` is true, splits
 *  them. Dry-run (`apply: false`) only reports. `onlyProductIds` restricts the scan (tests).
 *  Safe to re-run: after a split a product no longer has two SKUs from one source, and a partly done
 *  split is completed rather than repeated. Deals are not moved: a deal row belongs to a product,
 *  not to a SKU, so which SKU an existing one described is unknowable — the next ingestion run
 *  re-upserts each SKU's own deal onto its own product. */
export async function splitCollapsedExternalProducts(options: { apply: boolean; onlyProductIds?: string[] }): Promise<SplitReport> {
  const db = getDb()
  const filter = options.onlyProductIds ? inArray(schema.productExternalRefs.productId, options.onlyProductIds) : undefined

  const refs = await db
    .select({
      refId: schema.productExternalRefs.id,
      productId: schema.productExternalRefs.productId,
      source: schema.productExternalRefs.source,
      externalId: schema.productExternalRefs.externalId,
      productName: schema.products.name,
    })
    .from(schema.productExternalRefs)
    .innerJoin(schema.products, eq(schema.products.id, schema.productExternalRefs.productId))
    .where(filter)

  const byGroup = new Map<string, typeof refs>()
  for (const ref of refs) {
    const key = `${ref.productId}|${ref.source}`
    byGroup.set(key, [...(byGroup.get(key) ?? []), ref])
  }

  const groups: CollapsedGroup[] = []
  for (const members of byGroup.values()) {
    if (members.length < 2) continue
    const sorted = [...members].sort((a, b) => (a.externalId < b.externalId ? -1 : a.externalId > b.externalId ? 1 : 0))
    const [keep, ...rest] = sorted
    groups.push({
      productId: keep.productId,
      productName: keep.productName,
      source: keep.source,
      keep: keep.externalId,
      split: rest.map((ref) => ({ refId: ref.refId, externalId: ref.externalId, newName: distinctProductName(keep.productName, ref.externalId) })),
    })
  }

  const report: SplitReport = { groups, applied: options.apply, productsCreated: 0, refsMoved: 0, pricesMoved: 0, dealsOnOriginals: 0 }

  if (groups.length > 0) {
    const deals = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.deals)
      .where(inArray(schema.deals.productId, groups.map((group) => group.productId)))
    report.dealsOnOriginals = deals[0]?.n ?? 0
  }
  if (!options.apply) return report

  for (const group of groups) {
    const original = await db.query.products.findFirst({ where: eq(schema.products.id, group.productId) })
    if (!original) continue

    for (const part of group.split) {
      // A partly done earlier run may already have created this product.
      let target = await db.query.products.findFirst({ where: eq(schema.products.name, part.newName) })
      if (!target) {
        const [created] = await db
          .insert(schema.products)
          .values({ name: part.newName, categoryId: original.categoryId, defaultUnit: original.defaultUnit, defaultLocation: original.defaultLocation })
          .returning()
        target = created
        report.productsCreated++
      }

      await db.update(schema.productExternalRefs).set({ productId: target.id }).where(eq(schema.productExternalRefs.id, part.refId))
      report.refsMoved++

      // Only this SKU's official observations move; other SKUs' rows on the original product stay.
      const moved = await db
        .update(schema.prices)
        .set({ productId: target.id })
        .where(
          and(
            eq(schema.prices.productId, group.productId),
            eq(schema.prices.sourceType, 'OFFICIAL'),
            eq(schema.prices.sourceReference, part.externalId),
          ),
        )
        .returning({ id: schema.prices.id })
      report.pricesMoved += moved.length
    }
  }
  return report
}
