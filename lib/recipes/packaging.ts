import type { PricePoint } from '@/lib/prices'
import type { ItemUnit } from '@/lib/types'

export type PackageSource = 'catalog' | 'name-extracted' | 'derived-from-price'

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


export type ExplicitPackageCandidate = {
  quantity: number
  unit: 'ks' | 'kg' | 'l'
}

/** Extracts explicit retail package sizes written in a product name, including multipacks such as
 * "8x 100 g" → 800 g. Inner sizes belonging to a multipack are ignored so "8x100g" cannot be
 * misread as a standalone 100 g package. */
export function extractExplicitPackageSizes(name: string): StandardPackage[] {
  const text = name.replace(/,/g, '.')
  const candidates: { start: number; end: number; package: StandardPackage }[] = []

  const toCanonical = (quantity: number, rawUnit: string): ExplicitPackageCandidate | null => {
    const unit = rawUnit.toLowerCase()
    if (unit === 'kg') return { quantity, unit: 'kg' }
    if (unit === 'g') return { quantity: quantity / 1000, unit: 'kg' }
    if (unit === 'l') return { quantity, unit: 'l' }
    if (unit === 'ml') return { quantity: quantity / 1000, unit: 'l' }
    return null
  }

  const multipack = /(d+(?:\.d+)?)\s*[x×]\s*(d+(?:\.d+)?)\s*(kg|ml|g|l)(?![a-z])/gi
  for (const match of text.matchAll(multipack)) {
    const count = Number(match[1])
    const each = Number(match[2])
    const canonical = toCanonical(count * each, match[3])
    const start = match.index ?? -1
    if (!canonical || start < 0) continue
    const quantity = Math.round(canonical.quantity * 1000) / 1000
    candidates.push({
      start,
      end: start + match[0].length,
      package: { quantity, unit: canonical.unit, label: formatPackageSize(quantity, canonical.unit), source: 'name-extracted' },
    })
  }

  const overlapsMultipack = (start: number, end: number) => candidates.some((entry) => start >= entry.start && end <= entry.end)
  const single = /(d+(?:\.d+)?)\s*(kg|ml|g|l)(?![a-z])/gi
  for (const match of text.matchAll(single)) {
    const start = match.index ?? -1
    if (start < 0 || overlapsMultipack(start, start + match[0].length)) continue
    const canonical = toCanonical(Number(match[1]), match[2])
    if (!canonical) continue
    const quantity = Math.round(canonical.quantity * 1000) / 1000
    candidates.push({
      start,
      end: start + match[0].length,
      package: { quantity, unit: canonical.unit, label: formatPackageSize(quantity, canonical.unit), source: 'name-extracted' },
    })
  }

  const pieces = /(\d+)\s*ks(?![a-z])/gi
  for (const match of text.matchAll(pieces)) {
    const start = match.index ?? -1
    if (start < 0) continue
    const quantity = Number(match[1])
    if (!Number.isFinite(quantity) || quantity <= 0) continue
    candidates.push({
      start,
      end: start + match[0].length,
      package: { quantity, unit: 'ks', label: formatPackageSize(quantity, 'ks'), source: 'name-extracted' },
    })
  }

  const seen = new Set<string>()
  return candidates
    .sort((a, b) => a.start - b.start)
    .map((entry) => entry.package)
    .filter((entry) => {
      const key = String(entry.quantity) + ':' + entry.unit
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/** Uses an explicit package size in the product name when it agrees with the price context. For
 * piece-priced products there is no reliable package-size ratio, so an explicit "N ks" marker is
 * sufficient evidence. Weight/volume markers must be close to the current package price ratio so a
 * product mentioning another quantity (for example a recipe serving size) cannot silently override it. */
export function resolveNamedPackageSize(
  name: string,
  price: { regularPrice: number; unit: ItemUnit; unitPrice: number },
): StandardPackage | null {
  const candidates = extractExplicitPackageSizes(name)
  if (candidates.length === 0) return null

  if (price.unit === 'ks') {
    const pieces = candidates.filter((candidate) => candidate.unit === 'ks')
    if (pieces.length === 0) return null
    return pieces.sort((a, b) => b.quantity - a.quantity)[0] ?? null
  }

  const inferred = inferPackageSize(price)
  if (!inferred || inferred.unit === 'ks') return null
  const tolerance = Math.max(0.0005, inferred.quantity * 0.02)
  return candidates.find((candidate) => candidate.unit === inferred.unit && Math.abs(candidate.quantity - inferred.quantity) <= tolerance) ?? null
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
