// Writes Teta's catalog into the app's data model.
//
// The catalog is read by the collector (lib/ingestion/teta-collector.ts) and normalized by
// lib/ingestion/teta-catalog.ts; this module is the only place that turns those records into rows.
//
// What it writes, and why:
//
//   products                The canonical product. Teta's SKU is attached to the catalog product the
//                           identity rules approved (lib/product-identity-teta.ts); when they are not
//                           unambiguous, the product gets its own row and the reference is marked
//                           for review. No product is ever merged or deleted.
//   product_packages        The package the retailer states ("100 ks"), as retailer-published
//                           evidence. The catalog's own package rows are the evidence the identity
//                           rules compare sizes with.
//   trade_items             The Teta SKU as a trade item of that product — the first real write to
//                           this table (docs/43).
//   retailer_product_refs   The Teta SKU as a source-scoped reference, with the identity status
//                           and the raw name, brand and package as the retailer published them.
//   prices                  The everyday price of the product at the Teta chain.
//
// Three decisions shape the price handling (CLAUDE.md sections 15, 16, 18):
//
//   * Teta publishes no promotion end date, so an action price has no validity window. It is
//     therefore not a deal, and it is not a price observation either: what is stored is the
//     everyday price, which is the price of the product outside an action. The action price stays
//     in the collected file, where it can be read.
//   * Teta has physical branches, but the app knows none of them, so the prices are chain-wide
//     (CHAIN scope, no branch). No branch is invented (CLAUDE.md section 14).
//   * Teta publishes no barcode, so a trade item is identified by its package. The EAN stays
//     missing rather than being guessed (CLAUDE.md section 12).
//
// The import is idempotent: a second run of the same file updates the same rows and creates no
// duplicates (CLAUDE.md section 34). It is a dry run unless `apply` is set.

import { eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import {
  loadExternalProductContext,
  loadLatestOfficialPrices,
  persistNamedPackageEvidence,
  recordOfficialPrices,
  resolveOrCreateProductFromExternal,
  type ExternalProductContext,
  type NamedPackageEvidence,
  type OfficialPriceObservation,
} from '@/lib/db/queries'
import { tetaPackageSignature, mergeTetaCatalogProducts, type TetaCatalogProduct } from '@/lib/ingestion/teta-catalog'
import { readTetaCatalogRecords } from '@/lib/ingestion/teta-collector'
import { TETA_CHAIN } from '@/lib/ingestion/teta'
import { resolveProductForSku } from '@/lib/products'
import {
  decideTetaIdentity,
  loadTetaIdentityCandidates,
  tetaIdentityRecords,
  type TetaIdentityDecision,
} from '@/lib/product-identity-teta'

/** The source name of every Teta reference (the `retailer_product_refs.source` text column). */
export const TETA_SOURCE = 'teta'

/** How many records are written in one batch (the repo's batch convention). */
export const TETA_IMPORT_BATCH_SIZE = 500

export type TetaImportOptions = {
  /** Write to the database. Without it the import only reports what it would do. */
  apply?: boolean
  /** How many records are handled in one batch. */
  batchSize?: number
  /** The day the observation is recorded on (YYYY-MM-DD). */
  observedAt?: string
}

export type TetaImportResult = {
  /** The records the import read. */
  records: number
  /** The records that were skipped because they are not usable. */
  skipped: number
  products: { created: number; linked: number }
  decisions: { auto: number; review: number; none: number }
  packages: number
  tradeItems: number
  retailerRefs: number
  prices: { written: number }
  /** The records whose price is an action price right now (no validity window, so no deal). */
  actionPrices: number
  /** What went wrong per record; one bad record does not stop the run. */
  errors: { externalId: string; message: string }[]
  /** The products whose identity needs a human look. */
  review: TetaIdentityDecision[]
}

/** The identity status a decision is stored with. */
function identityStatus(decision: TetaIdentityDecision | undefined): 'unresolved' | 'matched' | 'review_required' {
  if (!decision) return 'unresolved'
  if (decision.status === 'auto') return 'matched'
  if (decision.status === 'review') return 'review_required'
  return 'unresolved'
}

/**
 * The products of the two collected layers, one per Teta product code.
 *
 * The category listing knows the price and the stock, the product page knows the package size, the
 * brand and the description. A product that is in both is one product with what both know.
 */
export async function readTetaCatalogProducts(
  listingPath: string,
  detailPath: string,
): Promise<TetaCatalogProduct[]> {
  const listings = await readTetaCatalogRecords(listingPath)
  const details = await readTetaCatalogRecords(detailPath)
  const records: TetaCatalogProduct[] = []
  for (const [externalId, listing] of listings) {
    const merged = mergeTetaCatalogProducts(listing, details.get(externalId) ?? null)
    if (merged) records.push(merged)
  }
  // A product that is only in the product-page file (the listing missed it) is still a product.
  for (const [externalId, detail] of details) {
    if (listings.has(externalId)) continue
    if (detail) records.push(detail)
  }
  return records
}

/** One package row of the catalog. */
type PackageRow = { id: string; productId: string; quantity: number; unit: string }

/** The package rows of the given products, in one query. */
async function loadPackageRows(productIds: string[]): Promise<Map<string, PackageRow[]>> {
  const byProduct = new Map<string, PackageRow[]>()
  if (productIds.length === 0) return byProduct
  const db = getDb()
  const rows = await db
    .select({
      id: schema.productPackages.id,
      productId: schema.productPackages.productId,
      quantity: schema.productPackages.quantity,
      unit: schema.productPackages.unit,
    })
    .from(schema.productPackages)
    .where(inArray(schema.productPackages.productId, productIds))
  for (const row of rows) {
    const list = byProduct.get(row.productId) ?? []
    list.push({ id: row.id, productId: row.productId, quantity: Number(row.quantity), unit: row.unit })
    byProduct.set(row.productId, list)
  }
  return byProduct
}

/**
 * The package row that belongs to a record.
 *
 * The retailer's own statement wins. When the product page has not been read yet, the package is
 * the one the price implies (the price divided by the unit price is the package size) — the same
 * size the shared name-package logic derived when it wrote the package row.
 */
function findPackageRow(record: TetaCatalogProduct, rows: PackageRow[]): PackageRow | null {
  if (record.package) {
    const wanted = record.package
    const match = rows.find((row) => row.unit === wanted.unit && Math.abs(row.quantity - wanted.quantity) < 0.001)
    if (match) return match
  }
  const price = record.regularPrice ?? record.price
  if (!(record.regularUnitPrice > 0) || record.unit === 'dávka') return null
  const implied = price / record.regularUnitPrice
  return rows.find((row) => row.unit === record.unit && Math.abs(row.quantity - implied) < 0.01) ?? null
}

/**
 * Imports Teta's catalog.
 *
 * The records are the normalized catalog products (lib/ingestion/teta-catalog.ts). Everything the
 * import needs to decide is read once: the identity candidates, the catalog products the names can
 * match, and the prices the chain already has for these SKUs.
 */
export async function importTetaCatalog(
  records: TetaCatalogProduct[],
  options: TetaImportOptions = {},
): Promise<TetaImportResult> {
  const apply = options.apply === true
  const batchSize = options.batchSize ?? TETA_IMPORT_BATCH_SIZE
  const observedAt = options.observedAt ?? new Date().toISOString().slice(0, 10)

  const result: TetaImportResult = {
    records: records.length,
    skipped: 0,
    products: { created: 0, linked: 0 },
    decisions: { auto: 0, review: 0, none: 0 },
    packages: 0,
    tradeItems: 0,
    retailerRefs: 0,
    prices: { written: 0 },
    actionPrices: 0,
    errors: [],
    review: [],
  }

  // A record without an app category cannot become a catalog product (the category is not
  // optional), and a record without a price is not a price observation. Both are reported.
  const usable = records.filter((record) => {
    if (!record.category) {
      result.skipped += 1
      result.errors.push({ externalId: record.externalId, message: 'no category the app models' })
      return false
    }
    if (!(record.price > 0)) {
      result.skipped += 1
      result.errors.push({ externalId: record.externalId, message: 'no usable price' })
      return false
    }
    return true
  })
  if (usable.length === 0) return result

  // Which catalog products the Teta SKUs may belong to, and which of those are already taken by
  // another Teta SKU (two Teta SKUs are two products, even when they share a name).
  const candidates = await loadTetaIdentityCandidates(tetaIdentityRecords(usable))
  const claimed = await loadClaimedProducts()
  const decisions = new Map<string, TetaIdentityDecision>()
  for (const record of usable) {
    const decision = decideTetaIdentity(
      {
        externalId: record.externalId,
        name: record.name,
        ...(record.brand ? { brand: record.brand } : {}),
        ...(record.package ? { package: { quantity: record.package.quantity, unit: record.package.unit } } : {}),
      },
      candidates.get(record.externalId) ?? [],
      { linkedProductIds: claimed },
    )
    decisions.set(record.externalId, decision)
    result.decisions[decision.status] += 1
    if (decision.status === 'review') result.review.push(decision)
  }

  const storeId = apply ? await loadTetaStoreId() : null

  for (let start = 0; start < usable.length; start += batchSize) {
    const batch = usable.slice(start, start + batchSize)
    const context: ExternalProductContext = await loadExternalProductContext('teta', {
      externalIds: batch.map((record) => record.externalId),
      names: batch.map((record) => record.name),
    })

    if (!apply) {
      // The dry run reports what the write would do; it writes nothing.
      for (const record of batch) {
        const decision = decisions.get(record.externalId)
        if (decision?.status === 'auto' && decision.productId) {
          result.products.linked += 1
          continue
        }
        if (context.refs.get(record.externalId)) {
          result.products.linked += 1
          continue
        }
        const { match } = resolveProductForSku(context.catalog, record.name, record.externalId, new Set(context.refs.values()))
        if (match) result.products.linked += 1
        else result.products.created += 1
      }
      continue
    }

    await writeBatch(batch, decisions, context, storeId!, observedAt, result)
  }

  return result
}

/** The catalog products that a Teta reference already points at (product id -> Teta SKU). */
async function loadClaimedProducts(): Promise<Map<string, string>> {
  const db = getDb()
  const rows = await db
    .select({ productId: schema.retailerProductRefs.productId, externalId: schema.retailerProductRefs.externalId })
    .from(schema.retailerProductRefs)
    .where(eq(schema.retailerProductRefs.source, TETA_SOURCE))
  const claimed = new Map<string, string>()
  for (const row of rows) {
    if (row.productId) claimed.set(row.productId, row.externalId)
  }
  return claimed
}

async function loadTetaStoreId(): Promise<string> {
  const db = getDb()
  const store = await db.query.stores.findFirst({ where: eq(schema.stores.chain, TETA_CHAIN) })
  if (!store) throw new Error(`No store for chain: ${TETA_CHAIN}`)
  return store.id
}

/**
 * Writes one batch: the products, the packages, the trade items, the retailer references and the
 * prices.
 *
 * The batch is written in that order, because each step needs the previous one: a package belongs
 * to a product, a trade item to a package, a reference to a trade item and a price to a product.
 */
async function writeBatch(
  batch: TetaCatalogProduct[],
  decisions: Map<string, TetaIdentityDecision>,
  context: ExternalProductContext,
  storeId: string,
  observedAt: string,
  result: TetaImportResult,
): Promise<void> {
  const db = getDb()

  // 1. The catalog product of every record.
  const productIds = new Map<string, string>()
  for (const record of batch) {
    const decision = decisions.get(record.externalId)
    const known = context.refs.get(record.externalId)
    if (known) {
      productIds.set(record.externalId, known)
      result.products.linked += 1
      continue
    }
    try {
      const catalogSize = context.catalog.length
      const productId = await resolveOrCreateProductFromExternal(
        {
          externalId: record.externalId,
          source: 'teta',
          name: record.name,
          category: record.category!,
          unit: record.unit,
          ...(record.brand ? { brand: record.brand } : {}),
        },
        context,
        decision?.status === 'auto' && decision.productId
          ? { linkToProductId: decision.productId }
          : undefined,
      )
      productIds.set(record.externalId, productId)
      if (context.catalog.length > catalogSize) result.products.created += 1
      else result.products.linked += 1
    } catch (error) {
      result.errors.push({ externalId: record.externalId, message: describeError(error) })
    }
  }

  const written = batch.filter((record) => productIds.has(record.externalId))
  if (written.length === 0) return

  // 2. The package the retailer states.
  const packageEvidence: NamedPackageEvidence[] = written.map((record) => ({
    productId: productIds.get(record.externalId)!,
    name: record.name,
    regularPrice: record.regularPrice ?? record.price,
    unit: record.unit,
    unitPrice: record.regularUnitPrice,
    observedAt,
    ...(record.package ? { package: record.package } : {}),
  }))
  result.packages += await persistNamedPackageEvidence(packageEvidence)

  // 3. The trade items — one per product and package, which is what the table's unique key says.
  const packageRows = await loadPackageRows(written.map((record) => productIds.get(record.externalId)!))
  const tradeItemValues = written
    .map((record) => {
      const productId = productIds.get(record.externalId)!
      const packageRow = findPackageRow(record, packageRows.get(productId) ?? [])
      if (!packageRow) return null
      return {
        productId,
        productPackageId: packageRow.id,
        packageSignature: tetaPackageSignature(record.package) ?? `${packageRow.quantity}${packageRow.unit}`,
        externalId: record.externalId,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  const tradeItemIds = new Map<string, string>()
  if (tradeItemValues.length > 0) {
    await db
      .insert(schema.tradeItems)
      .values(
        tradeItemValues.map((item) => ({
          productId: item.productId,
          productPackageId: item.productPackageId,
          packageSignature: item.packageSignature,
          status: 'active',
        })),
      )
      .onConflictDoNothing()
    // The trade item that is already there for this package is found by the package it holds.
    const packageIds = [...new Set(tradeItemValues.map((item) => item.productPackageId))]
    for (const part of chunks(packageIds, 500)) {
      const existing = await db
        .select({ id: schema.tradeItems.id, productPackageId: schema.tradeItems.productPackageId })
        .from(schema.tradeItems)
        .where(inArray(schema.tradeItems.productPackageId, part))
      for (const row of existing) {
        if (row.productPackageId) tradeItemIds.set(row.productPackageId, row.id)
      }
    }
    result.tradeItems += tradeItemValues.length
  }

  // 4. The retailer references.
  const refRows = written.map((record) => {
    const productId = productIds.get(record.externalId)!
    const item = tradeItemValues.find((entry) => entry.externalId === record.externalId)
    return {
      productId,
      tradeItemId: item ? tradeItemIds.get(item.productPackageId) ?? null : null,
      source: TETA_SOURCE,
      externalId: record.externalId,
      sourceUrl: record.url,
      identityStatus: identityStatus(decisions.get(record.externalId)),
      rawName: record.name,
      rawBrand: record.brand ?? null,
      rawPackage: record.packageText ?? null,
    }
  })

  const insertedRefs = await db
    .insert(schema.retailerProductRefs)
    .values(refRows)
    .onConflictDoUpdate({
      target: [schema.retailerProductRefs.source, schema.retailerProductRefs.externalId],
      set: {
        tradeItemId: sql`excluded.trade_item_id`,
        productId: sql`excluded.product_id`,
        sourceUrl: sql`excluded.source_url`,
        identityStatus: sql`excluded.identity_status`,
        rawName: sql`excluded.raw_name`,
        rawBrand: sql`excluded.raw_brand`,
        rawPackage: sql`excluded.raw_package`,
        lastSeenAt: sql`now()`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: schema.retailerProductRefs.id, externalId: schema.retailerProductRefs.externalId })
  const refIds = new Map(insertedRefs.map((row) => [row.externalId, row.id]))
  result.retailerRefs += insertedRefs.length

  // 5. The prices. The everyday price is what the product costs outside an action; the action
  //    price has no validity window, so it is not a price observation and not a deal.
  const observations: OfficialPriceObservation[] = written.map((record) => ({
    productId: productIds.get(record.externalId)!,
    storeId,
    sourceReference: record.externalId,
    regularPrice: record.regularPrice ?? record.price,
    currency: 'CZK',
    unit: record.unit,
    unitPrice: record.regularUnitPrice,
    observedAt,
  }))
  for (const record of written) {
    if (record.price !== (record.regularPrice ?? record.price)) result.actionPrices += 1
  }

  const latest = await loadLatestOfficialPrices(storeId, observations.map((observation) => observation.sourceReference))
  const priceResults = await recordOfficialPrices(observations, latest)
  result.prices.written += priceResults.filter((entry) => entry.action === 'insert' || entry.action === 'update-same-day').length

  // The price rows point at the trade item and the retailer reference, so a price can be traced
  // back to the retailer SKU it came from.
  const priceIds = priceResults.map((entry) => entry.latest?.id ?? null)
  await linkPrices(written, refIds, tradeItemValues, tradeItemIds, priceIds)
}

/** Sets the trade item and the retailer reference on the price rows of this batch. */
async function linkPrices(
  batch: TetaCatalogProduct[],
  refIds: Map<string, string>,
  tradeItemValues: { externalId: string; productPackageId: string }[],
  tradeItemIds: Map<string, string>,
  priceIds: (string | null)[],
): Promise<void> {
  const db = getDb()
  const tradeItemByExternal = new Map(tradeItemValues.map((item) => [item.externalId, tradeItemIds.get(item.productPackageId) ?? null]))
  const values = sql.join(
    batch.map((record, index) => {
      const priceId = priceIds[index]
      const tradeItemId = tradeItemByExternal.get(record.externalId)
      const refId = refIds.get(record.externalId)
      if (!priceId) return null
      return sql`(${priceId}::uuid, ${tradeItemId ?? null}::uuid, ${refId ?? null}::uuid)`
    }).filter((entry): entry is ReturnType<typeof sql> => entry !== null),
    sql`, `,
  )
  if (!values) return
  await db.execute(sql`
    UPDATE prices p
    SET trade_item_id = COALESCE(v.trade_item_id, p.trade_item_id),
        retailer_product_ref_id = COALESCE(v.retailer_product_ref_id, p.retailer_product_ref_id)
    FROM (VALUES ${values}) AS v(id, trade_item_id, retailer_product_ref_id)
    WHERE p.id = v.id
  `)
}

function chunks<T>(values: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size))
  return out
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
