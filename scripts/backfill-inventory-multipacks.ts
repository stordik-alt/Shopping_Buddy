import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { resolveInventoryPackage, inventoryQuantityFromPackage } from '@/lib/inventory-packaging'

async function main() {
const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const scopeArg = process.argv.find((arg) => arg.startsWith('--scope='))?.split('=')[1] ?? 'safe'
if (scopeArg !== 'safe' && scopeArg !== 'all') throw new Error('Invalid --scope; use safe or all')
const beforeArg = process.argv.find((arg) => arg.startsWith('--before='))?.split('=')[1]
const before = beforeArg ? new Date(beforeArg) : null
if (before && Number.isNaN(before.getTime())) throw new Error('Invalid --before timestamp')

const db = getDb()

const pantryRows = await db.query.pantryItems.findMany({
  where: and(eq(schema.pantryItems.unit, 'ks'), isNotNull(schema.pantryItems.productId)),
  columns: { id: true, householdId: true, productId: true, name: true, quantity: true, unit: true, addedAt: true },
})

const packages = await db.query.productPackages.findMany({
  columns: { productId: true, quantity: true, unit: true, packageCount: true, packageUnitQuantity: true, packageUnit: true },
})
const packagesByProduct = new Map<string, typeof packages>()
for (const pkg of packages) {
  const list = packagesByProduct.get(pkg.productId) ?? []
  list.push(pkg)
  packagesByProduct.set(pkg.productId, list)
}

const purchased = await db
  .select({
    householdId: schema.purchases.householdId,
    productId: schema.purchaseItems.productId,
    packageQuantity: sql<number>`coalesce(sum(${schema.purchaseItems.quantity})::double precision, 0)`,
    latestPurchaseDate: sql<string | null>`max(${schema.purchases.date})`,
  })
  .from(schema.purchaseItems)
  .innerJoin(schema.purchases, eq(schema.purchases.id, schema.purchaseItems.purchaseId))
  .where(and(eq(schema.purchaseItems.unit, 'ks'), isNotNull(schema.purchaseItems.productId)))
  .groupBy(schema.purchases.householdId, schema.purchaseItems.productId)

const purchaseByKey = new Map(purchased.map((row) => [`${row.householdId}:${row.productId}`, row]))

const rows: Array<Record<string, unknown>> = []
for (const item of pantryRows) {
  if (!item.productId || item.quantity <= 0) continue
  if (before && item.addedAt >= before) {
    rows.push({ id: item.id, name: item.name, status: 'SKIPPED_AFTER_CUTOFF', before: item.quantity, after: item.quantity })
    continue
  }

  const pkg = resolveInventoryPackage(item.name, packagesByProduct.get(item.productId) ?? [])
  if (!pkg) {
    const productPackages = packagesByProduct.get(item.productId) ?? []
    const multipackMetadata = productPackages.filter((candidate) =>
      candidate.packageCount != null &&
      candidate.packageCount > 1 &&
      candidate.packageUnit != null,
    )
    rows.push({
      id: item.id,
      name: item.name,
      status: multipackMetadata.length > 0 ? 'SKIPPED_AMBIGUOUS_PACKAGE' : 'SKIPPED_NO_MULTIPACK_METADATA',
      before: item.quantity,
      after: item.quantity,
      packageVariants: multipackMetadata.length,
    })
    continue
  }

  const purchase = purchaseByKey.get(`${item.householdId}:${item.productId}`)
  const purchasedPackages = purchase?.packageQuantity ?? 0
  const exactPurchaseMatch = purchasedPackages > 0 && item.quantity === purchasedPackages
  const likelyAlreadyPhysical = purchasedPackages > 0 && item.quantity > purchasedPackages
  const status = exactPurchaseMatch
    ? 'SAFE_MATCH'
    : likelyAlreadyPhysical
      ? 'LIKELY_ALREADY_PHYSICAL'
      : purchasedPackages > 0
        ? 'AMBIGUOUS'
        : 'NO_PURCHASE_HISTORY'
  const converted = inventoryQuantityFromPackage(item.quantity, pkg)
  rows.push({
    id: item.id,
    name: item.name,
    status,
    before: item.quantity,
    after: converted.quantity,
    unit: converted.unit,
    packageCount: pkg.packageCount,
    packageUnitQuantity: pkg.packageUnitQuantity,
    packageUnit: pkg.packageUnit,
    purchasedPackages,
    latestPurchaseDate: purchase?.latestPurchaseDate ?? null,
  })
}

const eligible = rows.filter((row) =>
  row.status === 'SAFE_MATCH' ||
  (scopeArg === 'all' && ['AMBIGUOUS', 'NO_PURCHASE_HISTORY'].includes(String(row.status))),
)

if (apply) {
  if (scopeArg === 'all') {
    console.warn('WARNING: --scope=all can reinterpret manually added stock as multipack packages. Use only after reviewing the dry-run output.')
  }
  await db.transaction(async (tx) => {
    for (const row of eligible) {
      await tx
        .update(schema.pantryItems)
        .set({ quantity: row.after as number, unit: 'ks' })
        .where(eq(schema.pantryItems.id, row.id as string))
    }
  })
}

const summary = {
  mode: apply ? 'apply' : 'dry-run',
  scope: scopeArg,
  before: before?.toISOString() ?? null,
  scanned: pantryRows.length,
  candidates: rows.length,
  safeMatches: rows.filter((row) => row.status === 'SAFE_MATCH').length,
  likelyAlreadyPhysical: rows.filter((row) => row.status === 'LIKELY_ALREADY_PHYSICAL').length,
  ambiguous: rows.filter((row) => row.status === 'AMBIGUOUS').length,
  noPurchaseHistory: rows.filter((row) => row.status === 'NO_PURCHASE_HISTORY').length,
  skippedPackage: rows.filter((row) => row.status === 'SKIPPED_AMBIGUOUS_PACKAGE').length,
  skippedNoMultipackMetadata: rows.filter((row) => row.status === 'SKIPPED_NO_MULTIPACK_METADATA').length,
  skippedAfterCutoff: rows.filter((row) => row.status === 'SKIPPED_AFTER_CUTOFF').length,
  applied: apply ? eligible.length : 0,
}
console.log(JSON.stringify(summary, null, 2))
for (const row of rows) console.log(JSON.stringify(row))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
