import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { extractExplicitPackageSizes } from '@/lib/recipes/packaging'
import type { ItemUnit } from '@/lib/types'

export type InventoryPackageCandidate = {
  quantity: number
  unit: 'ks' | 'kg' | 'l'
  packageCount: number | null
  packageUnitQuantity: number | null
  packageUnit: ItemUnit | null
}

export type InventoryPackage = InventoryPackageCandidate & { packageCount: number }

export function resolveInventoryPackage(name: string, packages: InventoryPackageCandidate[]): InventoryPackage | null {
  const explicit = extractExplicitPackageSizes(name)
  const matches = packages.filter((pkg) =>
    pkg.packageCount != null &&
    pkg.packageCount > 1 &&
    pkg.packageUnit != null &&
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

export async function purchasedInventoryQuantity(item: {
  productId: string | null
  name: string
  quantity: number
  unit: ItemUnit
}): Promise<{ quantity: number; unit: ItemUnit; unitQuantity: number | null; unitUnit: ItemUnit | null }> {
  if (!item.productId || item.unit !== 'ks' || !Number.isFinite(item.quantity) || item.quantity <= 0) {
    return { quantity: item.quantity, unit: item.unit, unitQuantity: null, unitUnit: null }
  }

  const packages = await getDb().query.productPackages.findMany({
    where: eq(schema.productPackages.productId, item.productId),
    columns: {
      quantity: true,
      unit: true,
      packageCount: true,
      packageUnitQuantity: true,
      packageUnit: true,
    },
  })

  const pkg = resolveInventoryPackage(item.name, packages)
  if (!pkg) return { quantity: item.quantity, unit: item.unit, unitQuantity: null, unitUnit: null }

  return inventoryQuantityFromPackage(item.quantity, pkg)
}
