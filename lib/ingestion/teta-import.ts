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
import { tetaPackageSignature, mergeTetaCatalogProducts, tetaRecordWithDerivedPackage, TETA_WARNING_UNIT_PRICE_DISAGREES, type TetaCatalogProduct } from '@/lib/ingestion/teta-catalog'
import { readTetaCatalogRecords } from '@/lib/ingestion/teta-collector'
import { TETA_CHAIN } from '@/lib/ingestion/teta'
import { resolveProductForSku } from '@/lib/products'
import {
  decideTetaIdentity,
  loadTetaIdentityCandidates,
  resolveTetaIdentityClaims,
  tetaIdentityRecords,
  type TetaIdentityDecision,
  type TetaIdentityStatus,
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
  /** The products that were linked automatically — kept so that a human can look at the links too. */
  linked: TetaIdentityDecision[]
}

/** The identity status a decision is stored with. */
function identityStatus(decision: TetaIdentityDecision | undefined): 'unresolved' | 'matched' | 'review_required' {
  if (!decision) return 'unresolved'
  if (decision.status === 'auto') return 'matched'
  if (decision.status === 'review') return 'review_required'
  return 'unresolved'
}

/** The decision a stored identity status stands for. */
function decisionStatus(stored: string): TetaIdentityStatus {
  if (stored === 'matched') return 'auto'
  if (stored === 'review_required') return 'review'
  return 'none'
}

/** One Teta reference the database already holds. */
type ExistingTetaRef = { productId: string; productName: string; identityStatus: string }

/**
 * The Teta references the database already holds.
 *
 * The identity of a Teta SKU is decided once — when the SKU is first imported — and the decision
 * is stored with the reference. A later run must not decide it again: the products the import
 * created are in the catalog by then, so every SKU would look like a perfect match with the
 * product the import made for it, and the review queue would empty itself without a human ever
 * looking at it.
 */
async function loadExistingTetaRefs(): Promise<Map<string, ExistingTetaRef>> {
  const db = getDb()
  const rows = await db
    .select({
      externalId: schema.retailerProductRefs.externalId,
      productId: schema.retailerProductRefs.productId,
      identityStatus: schema.retailerProductRefs.identityStatus,
      productName: schema.products.name,
    })
    .from(schema.retailerProductRefs)
    .innerJoin(schema.products, eq(schema.products.id, schema.retailerProductRefs.productId))
    .where(eq(schema.retailerProductRefs.source, TETA_SOURCE))
  const existing = new Map<string, ExistingTetaRef>()
  for (const row of rows) {
    // The join is on the product, so a reference without a product is not in the result.
    if (!row.productId) continue
    existing.set(row.externalId, {
      productId: row.productId,
      productName: row.productName,
      identityStatus: row.identityStatus,
    })
  }
  return existing
}

/**
 * The products of the two collected layers, one per Teta product code.
 *
 * The category listing knows the price and the stock, the product page knows the package size, the
 * brand and the description. A product that is in both is one product with what both know.
 *
 * The package size and the unit price are read again with the current rules, so a catalog that
 * was collected earlier is read the way the code reads it today (the collected file keeps the
 * retailer's own statement; the size and the price per unit are readings of it).
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
    if (merged) records.push(tetaRecordWithDerivedPackage(merged))
  }
  // A product that is only in the product-page file (the listing missed it) is still a product.
  for (const [externalId, detail] of details) {
    if (listings.has(externalId)) continue
    if (detail) records.push(tetaRecordWithDerivedPackage(detail))
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
 *
 * A record that states no package and whose price does not identify one still has a package when
 * the product has exactly one: a product with a single package has no other package its SKU could
 * be. A product with several packages is left without a trade item — pointing at the wrong one
 * would be a guess.
 */
function findPackageRow(record: TetaCatalogProduct, rows: PackageRow[]): PackageRow | null {
  if (record.package) {
    const wanted = record.package
    const match = rows.find((row) => row.unit === wanted.unit && Math.abs(row.quantity - wanted.quantity) < 0.001)
    if (match) return match
  }
  const price = record.regularPrice ?? record.price
  if (record.regularUnitPrice > 0 && record.unit !== 'dávka') {
    const implied = price / record.regularUnitPrice
    const match = rows.find((row) => row.unit === record.unit && Math.abs(row.quantity - implied) < 0.01)
    if (match) return match
  }
  return rows.length === 1 ? rows[0] : null
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
    linked: [],
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
        // A record whose price and unit price contradict its package statement states no size that
        // can be trusted, so it is never linked automatically.
        ...(record.warnings.includes(TETA_WARNING_UNIT_PRICE_DISAGREES) ? { contradictory: true } : {}),
      },
      candidates.get(record.externalId) ?? [],
      { linkedProductIds: claimed },
    )
    decisions.set(record.externalId, decision)
  }

  // Two Teta SKUs of one product line ("… 110" and "… 120") can both look like the same catalog
  // product. Only one of them can be that product, and it is the one whose name fits it best — the
  // other one keeps its own product and is reported for review.
  resolveTetaIdentityClaims(decisions.values())

  // The decision of a SKU that is already imported stands. The comparison above is done again,
  // because the report has to show the evidence the catalog offers today, but the answer that was
  // decided when the SKU was first imported is the one that counts: the product it is linked to and
  // the status that says whether a human has to look at it.
  const existing = await loadExistingTetaRefs()
  for (const [externalId, stored] of existing) {
    const decision = decisions.get(externalId)
    if (!decision) continue
    decisions.set(externalId, {
      ...decision,
      status: decisionStatus(stored.identityStatus),
      productId: stored.productId,
      productName: stored.productName,
      // The score of an automatic link is the score of the product it was made to. The comparison
      // took that product out of the candidates (it is the import's own conclusion, not evidence),
      // so its score is carried along separately.
      ...(stored.identityStatus === 'matched' && decision.ownProduct
        ? { score: decision.ownProduct.score }
        : {}),
    })
  }

  for (const decision of decisions.values()) {
    result.decisions[decision.status] += 1
    if (decision.status === 'review') result.review.push(decision)
    if (decision.status === 'auto') result.linked.push(decision)
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

  // 3. The prices. The everyday price is what the product costs outside an action; the action
  //    price has no validity window, so it is not a price observation and not a deal.
  //
  //    The prices are written before the trade items on purpose: writing a price derives the
  //    package that the price implies (a database trigger), and the trade item is the product's
  //    package. A trade item written before the price would be missing for every product whose
  //    package only the price states, and the next run of the import would add it — the import
  //    would never reach a state where another run changes nothing.
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
  const priceIds = priceResults.map((entry) => entry.latest?.id ?? null)

  // 4. The trade items — one per product and package, which is what the table's unique key says.
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
    const inserted = await db
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
      .returning({ id: schema.tradeItems.id })
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
    // A package that already had a trade item (the same product from another retailer) keeps that
    // one — the trade item is the product's package, not the retailer's row of it.
    result.tradeItems += inserted.length
  }

  // 5. The retailer references.
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
        // The product of a reference that is already there stays: a link is decided once, and a
        // human who has repointed it in the meantime must not be overruled by the next import.
        // A reference without a product yet (a run that failed half-way) is filled in.
        productId: sql`COALESCE(${schema.retailerProductRefs.productId}, excluded.product_id)`,
        sourceUrl: sql`excluded.source_url`,
        // The identity status is not touched either: it is the decision, and the decision is made
        // once (see loadExistingTetaRefs).
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

  // 6. The price rows point at the trade item and the retailer reference, so a price can be traced
  //    back to the retailer SKU it came from.
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
