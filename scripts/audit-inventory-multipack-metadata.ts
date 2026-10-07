import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

type AuditStatus =
  | 'EXPLICIT_MULTIPACK_CANDIDATE'
  | 'PRODUCT_WITH_MISSING_METADATA'
  | 'AMBIGUOUS'
  | 'NO_MULTIPACK'

type AuditRow = {
  id: string
  householdId: string
  productId: string
  name: string
  pantryQuantity: number
  packageVariants: number
  packageCounts: number[]
  purchaseQuantities: number[]
  purchaseNames: string[]
  explicitMultipackHints: string[]
  status: AuditStatus
}

function hints(name: string): string[] {
  const found = new Set<string>()
  const patterns = [
    /\b\d+\s*[x×]\s*\d+(?:[,.]\d+)?\s*(?:kg|g|l|ml|ks)\b/gi,
    /\b\d+\s*(?:ks|k?s)\b/gi,
  ]
  for (const pattern of patterns) {
    for (const match of name.matchAll(pattern)) found.add(match[0].replace(/\s+/g, ' ').trim())
  }
  return [...found]
}

async function main() {
  const db = getDb()

  const pantryRows = await db.query.pantryItems.findMany({
    where: and(eq(schema.pantryItems.unit, 'ks'), isNotNull(schema.pantryItems.productId)),
    columns: { id: true, householdId: true, productId: true, name: true, quantity: true },
  })

  const packages = await db.query.productPackages.findMany({
    columns: { productId: true, quantity: true, unit: true, packageCount: true, packageUnitQuantity: true, packageUnit: true },
  })
  const packageByProduct = new Map<string, typeof packages>()
  for (const pkg of packages) {
    const list = packageByProduct.get(pkg.productId) ?? []
    list.push(pkg)
    packageByProduct.set(pkg.productId, list)
  }

  const purchases = await db
    .select({
      householdId: schema.purchases.householdId,
      productId: schema.purchaseItems.productId,
      quantity: schema.purchaseItems.quantity,
      unit: schema.purchaseItems.unit,
      name: schema.purchaseItems.name,
    })
    .from(schema.purchaseItems)
    .innerJoin(schema.purchases, eq(schema.purchases.id, schema.purchaseItems.purchaseId))
    .where(and(eq(schema.purchaseItems.unit, 'ks'), isNotNull(schema.purchaseItems.productId)))

  const purchasesByKey = new Map<string, typeof purchases>()
  for (const purchase of purchases) {
    if (!purchase.productId) continue
    const key = `${purchase.householdId}:${purchase.productId}`
    const list = purchasesByKey.get(key) ?? []
    list.push(purchase)
    purchasesByKey.set(key, list)
  }

  const rows: AuditRow[] = []
  for (const item of pantryRows) {
    const productPackages = packageByProduct.get(item.productId!) ?? []
    const multipacks = productPackages.filter((pkg) =>
      pkg.packageCount != null &&
      pkg.packageCount > 1 &&
      pkg.packageUnit != null,
    )
    const history = purchasesByKey.get(`${item.householdId}:${item.productId}`) ?? []
    const purchaseNames = [...new Set(history.map((purchase) => purchase.name))]
    const explicitHints = [...new Set([
      ...hints(item.name),
      ...purchaseNames.flatMap(hints),
    ])]
    const hasStrongHint = explicitHints.some((hint) => /[x×]/i.test(hint))
    const packageCounts = [...new Set(multipacks.map((pkg) => pkg.packageCount!))].sort((a, b) => a - b)

    let status: AuditStatus
    if (multipacks.length > 0 && packageCounts.length === 1 && hasStrongHint) {
      status = 'EXPLICIT_MULTIPACK_CANDIDATE'
    } else if (multipacks.length === 0 && hasStrongHint) {
      status = 'PRODUCT_WITH_MISSING_METADATA'
    } else if (multipacks.length > 1 || packageCounts.length > 1) {
      status = 'AMBIGUOUS'
    } else {
      status = 'NO_MULTIPACK'
    }

    rows.push({
      id: item.id,
      householdId: item.householdId,
      productId: item.productId!,
      name: item.name,
      pantryQuantity: item.quantity,
      packageVariants: multipacks.length,
      packageCounts,
      purchaseQuantities: history.map((purchase) => Number(purchase.quantity)),
      purchaseNames,
      explicitMultipackHints: explicitHints,
      status,
    })
  }

  const summary = {
    mode: 'audit-only',
    scanned: rows.length,
    explicitMultipackCandidates: rows.filter((row) => row.status === 'EXPLICIT_MULTIPACK_CANDIDATE').length,
    productsWithMissingMetadata: rows.filter((row) => row.status === 'PRODUCT_WITH_MISSING_METADATA').length,
    ambiguous: rows.filter((row) => row.status === 'AMBIGUOUS').length,
    noMultipack: rows.filter((row) => row.status === 'NO_MULTIPACK').length,
    writes: 0,
  }

  console.log(JSON.stringify(summary, null, 2))
  for (const row of rows) console.log(JSON.stringify(row))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
