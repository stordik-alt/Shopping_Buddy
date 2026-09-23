import 'dotenv/config'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

type Candidate = {
  receiptImportId: string
  storeId: string
  purchaseId: string | null
  date: string | null
  address: string | null
  city: string | null
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase('cs-CZ').replace(/\s+/g, ' ') ?? ''
}

function parseStore(parserResult: string | null): { address: string | null; city: string | null } {
  if (!parserResult) return { address: null, city: null }

  try {
    const parsed = JSON.parse(parserResult) as {
      store?: { address?: unknown; city?: unknown }
    }
    return {
      address: typeof parsed.store?.address === 'string' ? parsed.store.address : null,
      city: typeof parsed.store?.city === 'string' ? parsed.store.city : null,
    }
  } catch {
    return { address: null, city: null }
  }
}

async function loadCandidates(): Promise<Candidate[]> {
  const db = getDb()
  const rows = await db
    .select({
      receiptImportId: schema.receiptImports.id,
      storeId: schema.receiptImports.storeId,
      purchaseId: schema.receiptImports.purchaseId,
      date: schema.receiptImports.date,
      parserResult: schema.receiptImports.parserResult,
    })
    .from(schema.receiptImports)
    .where(
      sql`${schema.receiptImports.storeLocationId} IS NULL
        AND ${schema.receiptImports.storeId} IS NOT NULL
        AND ${schema.receiptImports.status} <> 'cancelled'`,
    )

  return rows.map((row) => {
    const store = parseStore(row.parserResult)
    return {
      receiptImportId: row.receiptImportId,
      storeId: row.storeId!,
      purchaseId: row.purchaseId,
      date: row.date,
      address: store.address,
      city: store.city,
    }
  })
}

async function findOrCreateLocation(storeId: string, address: string, city: string): Promise<{ id: string; created: boolean }> {
  const db = getDb()
  const wantedAddress = normalize(address)
  const wantedCity = normalize(city)

  const existing = await db.query.storeLocations.findMany({
    where: eq(schema.storeLocations.storeId, storeId),
  })
  const match = existing.find(
    (location) =>
      normalize(location.address) === wantedAddress &&
      normalize(location.city) === wantedCity,
  )
  if (match) return { id: match.id, created: false }

  const [created] = await db
    .insert(schema.storeLocations)
    .values({
      storeId,
      name: address.trim(),
      address: address.trim(),
      city: city.trim(),
    })
    .returning({ id: schema.storeLocations.id })

  return { id: created.id, created: true }
}

async function updateReceiptAndPurchase(receiptImportId: string, purchaseId: string | null, locationId: string) {
  const db = getDb()
  await db
    .update(schema.receiptImports)
    .set({ storeLocationId: locationId })
    .where(eq(schema.receiptImports.id, receiptImportId))

  if (purchaseId) {
    await db
      .update(schema.purchases)
      .set({ storeLocationId: locationId })
      .where(eq(schema.purchases.id, purchaseId))
  }
}

async function updateUnambiguousReceiptPrices(
  storeId: string,
  locationId: string,
  purchaseId: string | null,
  date: string | null,
  receiptImportId: string,
): Promise<number> {
  if (!purchaseId || !date) return 0

  const db = getDb()
  const purchaseItems = await db.query.purchaseItems.findMany({
    where: eq(schema.purchaseItems.purchaseId, purchaseId),
    columns: { productId: true },
  })

  let updated = 0

  for (const item of purchaseItems) {
    if (!item.productId) continue

    const candidates = await db
      .select({ id: schema.prices.id })
      .from(schema.prices)
      .where(sql`
        ${schema.prices.storeId} = ${storeId}
        AND ${schema.prices.storeLocationId} IS NULL
        AND ${schema.prices.locationResolution} = 'UNKNOWN'
        AND ${schema.prices.sourceType} = 'RECEIPT'
        AND ${schema.prices.productId} = ${item.productId}
        AND ${schema.prices.observedAt} = ${date}::date
      `)

    // Multiple receipts for the same chain/product/date make the price-to-receipt
    // relationship ambiguous. Leave those observations UNKNOWN instead of guessing.
    if (candidates.length !== 1) continue

    await db
      .update(schema.prices)
      .set({
        storeLocationId: locationId,
        locationResolution: 'RESOLVED',
        sourceReference: sql`COALESCE(${schema.prices.sourceReference}, ${`receipt_import:${receiptImportId}`})`,
      })
      .where(eq(schema.prices.id, candidates[0].id))

    updated += 1
  }

  return updated
}

async function main() {
  const apply = process.argv.includes('--apply')
  const candidates = await loadCandidates()

  const report = {
    mode: apply ? 'APPLY' : 'DRY_RUN',
    candidates: candidates.length,
    withAddress: 0,
    withoutAddress: 0,
    locationsCreated: 0,
    receiptsResolved: 0,
    purchasesResolved: 0,
    pricesResolved: 0,
    pricesLeftAmbiguous: 0,
  }

  for (const candidate of candidates) {
    if (!candidate.address?.trim()) {
      report.withoutAddress += 1
      continue
    }

    report.withAddress += 1

    if (!apply) continue

    const { id: locationId, created } = await findOrCreateLocation(
      candidate.storeId,
      candidate.address,
      candidate.city ?? '',
    )

    if (created) report.locationsCreated += 1

    await updateReceiptAndPurchase(candidate.receiptImportId, candidate.purchaseId, locationId)
    report.receiptsResolved += 1
    if (candidate.purchaseId) report.purchasesResolved += 1

    const updatedPrices = await updateUnambiguousReceiptPrices(
      candidate.storeId,
      locationId,
      candidate.purchaseId,
      candidate.date,
      candidate.receiptImportId,
    )
    report.pricesResolved += updatedPrices
  }

  console.log(JSON.stringify(report, null, 2))

  if (!apply) {
    console.log('\nDry-run only. No database rows were changed.')
    console.log('Run with --apply after reviewing the report.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
