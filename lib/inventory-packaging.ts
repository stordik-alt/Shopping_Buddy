import { eq, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { extractExplicitPackageSizes } from '@/lib/recipes/packaging'
import type { ItemUnit } from '@/lib/types'

export type InventoryPackageCandidate = {
  quantity: number
  unit: ItemUnit
  packageCount: number | null
  packageUnitQuantity: number | null
  packageUnit: ItemUnit | null
}

export type InventoryPackage = InventoryPackageCandidate & { packageCount: number }

export function resolveInventoryPackage(name: string, packages: InventoryPackageCandidate[]): InventoryPackage | null {
  const multipacks = packages.filter((pkg) =>
    pkg.packageCount != null &&
    pkg.packageCount > 1 &&
    pkg.packageUnit != null,
  )
  if (multipacks.length === 1) return multipacks[0] as InventoryPackage

  const explicit = extractExplicitPackageSizes(name)
  // A purchased line can legitimately be a retail multipack even when the product package
  // catalog has not learned the package yet. Piece-count markers (e.g. `30 ks` or egg `M30`)
  // are explicit package evidence, so use them rather than storing one retail pack as one
  // physical piece. Weight/volume names are intentionally not inferred here.
  if (multipacks.length === 0) {
    const piecePackage = explicit.find((candidate) => candidate.unit === 'ks' && candidate.quantity > 1)
    if (piecePackage) {
      return {
        quantity: piecePackage.quantity,
        unit: 'ks',
        packageCount: piecePackage.quantity,
        packageUnitQuantity: 1,
        packageUnit: 'ks',
      }
    }
  }

  const matches = multipacks.filter((pkg) =>
    explicit.some((candidate) => candidate.quantity === pkg.quantity && candidate.unit === pkg.unit),
  )
  if (matches.length !== 1) return null
  return matches[0] as InventoryPackage
}

export function inventoryQuantityFromPackage(quantity: number, pkg: InventoryPackage): { quantity: number; unit: ItemUnit; unitQuantity: number | null; unitUnit: ItemUnit | null } {
  return {
    quantity: quantity * pkg.packageCount,
    unit: 'ks',
    unitQuantity: pkg.packageUnitQuantity ?? 1,
    unitUnit: pkg.packageUnit ?? 'ks',
  }
}

export type PurchasedInventoryItem = {
  productId: string | null
  name: string
  quantity: number
  unit: ItemUnit
}

export type PurchasedInventoryQuantity = {
  quantity: number
  unit: ItemUnit
  unitQuantity: number | null
  unitUnit: ItemUnit | null
}

/**
 * Resolves packaging for several purchased lines with one DB read instead of one
 * product_packages query per line. Receipt/manual-purchase flows commonly process
 * many lines at once, so this avoids an N+1 round-trip pattern.
 */
export async function purchasedInventoryQuantities(items: PurchasedInventoryItem[]): Promise<PurchasedInventoryQuantity[]> {
  const result = items.map((item) => ({
    quantity: item.quantity,
    unit: item.unit,
    unitQuantity: null,
    unitUnit: null,
  } satisfies PurchasedInventoryQuantity))

  const productIds = [...new Set(items
    .filter((item) => item.productId && item.unit === 'ks' && Number.isFinite(item.quantity) && item.quantity > 0)
    .map((item) => item.productId as string))]

  if (productIds.length === 0) return result

  const packages = await getDb().query.productPackages.findMany({
    where: inArray(schema.productPackages.productId, productIds),
    columns: {
      productId: true,
      quantity: true,
      unit: true,
      packageCount: true,
      packageUnitQuantity: true,
      packageUnit: true,
    },
  })

  const packagesByProduct = new Map<string, typeof packages>()
  for (const pkg of packages) {
    const rows = packagesByProduct.get(pkg.productId) ?? []
    rows.push(pkg)
    packagesByProduct.set(pkg.productId, rows)
  }

  return items.map((item, index) => {
    if (!item.productId || item.unit !== 'ks' || !Number.isFinite(item.quantity) || item.quantity <= 0) return result[index]
    const pkg = resolveInventoryPackage(item.name, packagesByProduct.get(item.productId) ?? [])
    return pkg ? inventoryQuantityFromPackage(item.quantity, pkg) : result[index]
  })
}

export async function purchasedInventoryQuantity(item: PurchasedInventoryItem): Promise<PurchasedInventoryQuantity> {
  return (await purchasedInventoryQuantities([item]))[0]
}
