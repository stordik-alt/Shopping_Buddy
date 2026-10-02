import type { PricePoint } from '@/lib/prices'
import type { ItemUnit } from '@/lib/types'

export type PackageSource = 'catalog' | 'derived-from-price'

export type StandardPackage = {
  quantity: number
  unit: 'ks' | 'kg' | 'l'
  label: string
  source: PackageSource
}

export type CatalogPackage = {
  quantity: number
  unit: 'kg' | 'l'
}

/**
 * Derives the size of one retail package from the package price and its unit price.
 * Example: 60 Kč package / 60 Kč per kg = 1 kg package.
 *
 * This remains the safe fallback when the persistent product package catalog has no matching entry.
 * Explicit retailer-provided package metadata can be modeled separately when product variants are added.
 */
export function inferPackageSize(price: Pick<PricePoint, 'regularPrice' | 'unit' | 'unitPrice'>): StandardPackage | null {
  if (!Number.isFinite(price.regularPrice) || price.regularPrice <= 0 || !Number.isFinite(price.unitPrice) || price.unitPrice <= 0) {
    return null
  }

  if (price.unit === 'ks') {
    return { quantity: 1, unit: 'ks', label: '1 ks', source: 'derived-from-price' }
  }

  if (price.unit !== 'kg' && price.unit !== 'g' && price.unit !== 'l' && price.unit !== 'ml') return null

  const rawQuantity = price.regularPrice / price.unitPrice
  if (!Number.isFinite(rawQuantity) || rawQuantity <= 0) return null

  const quantity = price.unit === 'g' || price.unit === 'kg'
    ? price.unit === 'g' ? rawQuantity / 1000 : rawQuantity
    : price.unit === 'ml' ? rawQuantity / 1000 : rawQuantity

  const unit: 'kg' | 'l' = price.unit === 'g' || price.unit === 'kg' ? 'kg' : 'l'
  const rounded = Math.round(quantity * 1000) / 1000

  return {
    quantity: rounded,
    unit,
    label: formatPackageSize(rounded, unit),
    source: 'derived-from-price',
  }
}

export function formatPackageSize(quantity: number, unit: 'ks' | 'kg' | 'l'): string {
  if (unit === 'ks') return `${quantity} ks`
  if (unit === 'kg') {
    if (quantity < 1) return `${Math.round(quantity * 1000)} g`
    return `${quantity} kg`
  }
  if (quantity < 1) return `${Math.round(quantity * 1000)} ml`
  return `${quantity} l`
}

/** Converts an ItemUnit into the canonical comparison unit used for package sizes. */
export function canonicalPackageUnit(unit: ItemUnit): 'ks' | 'kg' | 'l' | null {
  if (unit === 'ks' || unit === 'kg' || unit === 'l') return unit
  if (unit === 'g') return 'kg'
  if (unit === 'ml') return 'l'
  return null
}

/**
 * Uses the persistent package catalog only when the current price observation agrees with a known
 * canonical package size. This avoids guessing between multiple package sizes of the same product.
 * If there is no exact catalog match, callers can safely fall back to inferPackageSize().
 */
export function resolveCatalogPackageSize(
  packages: CatalogPackage[],
  price: { regularPrice: number; unit: ItemUnit; unitPrice: number },
): StandardPackage | null {
  const inferred = inferPackageSize(price)
  if (!inferred || inferred.unit === 'ks') return null

  const match = packages.find((candidate) =>
    candidate.unit === inferred.unit && Math.abs(candidate.quantity - inferred.quantity) < 0.0005,
  )
  if (!match) return null

  return {
    quantity: match.quantity,
    unit: match.unit,
    label: formatPackageSize(match.quantity, match.unit),
    source: 'catalog',
  }
}
