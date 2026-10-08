export type QuantityUnit = 'ks' | 'mg' | 'g' | 'kg' | 'ml' | 'l' | 'mm' | 'cm' | 'm' | 'cm2' | 'm2'
export type QuantityDimension = 'count' | 'mass' | 'volume' | 'length' | 'area'
export type ConversionMethod = 'direct_unit' | 'declared_multipack' | 'verified_attribute' | 'package_structure' | 'unknown'

type UnitDefinition = { dimension: QuantityDimension; canonical: QuantityUnit; multiplier: number }
const UNITS: Record<QuantityUnit, UnitDefinition> = {
  ks: { dimension: 'count', canonical: 'ks', multiplier: 1 }, mg: { dimension: 'mass', canonical: 'kg', multiplier: 0.000001 },
  g: { dimension: 'mass', canonical: 'kg', multiplier: 0.001 }, kg: { dimension: 'mass', canonical: 'kg', multiplier: 1 },
  ml: { dimension: 'volume', canonical: 'l', multiplier: 0.001 }, l: { dimension: 'volume', canonical: 'l', multiplier: 1 },
  mm: { dimension: 'length', canonical: 'm', multiplier: 0.001 }, cm: { dimension: 'length', canonical: 'm', multiplier: 0.01 }, m: { dimension: 'length', canonical: 'm', multiplier: 1 },
  cm2: { dimension: 'area', canonical: 'm2', multiplier: 0.0001 }, m2: { dimension: 'area', canonical: 'm2', multiplier: 1 },
}

export type NormalizedQuantity = { quantity: number; unit: QuantityUnit; dimension: QuantityDimension; method: ConversionMethod; confidence: number }
export type PackageNormalizationInput = { quantity: number; unit: QuantityUnit; packageCount?: number | null; packageUnitQuantity?: number | null; packageUnit?: QuantityUnit | null }
export type NormalizedPackage = NormalizedQuantity & { packageVerified: boolean }

/** Converts only within one physical dimension. No package/volume/mass assumptions are made. */
export function normalizeQuantity(quantity: number, unit: QuantityUnit): NormalizedQuantity | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null
  const definition = UNITS[unit]
  if (!definition) return null
  return { quantity: round(quantity * definition.multiplier), unit: definition.canonical, dimension: definition.dimension, method: 'direct_unit', confidence: 1 }
}

export function convertQuantity(quantity: number, from: QuantityUnit, to: QuantityUnit): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0 || !UNITS[from] || !UNITS[to]) return null
  if (UNITS[from].dimension !== UNITS[to].dimension) return null
  return round((quantity * UNITS[from].multiplier) / UNITS[to].multiplier)
}

/** Existing product package quantity is already the total consumer-package quantity. Inner multipack metadata is only verified, never multiplied again. */
export function normalizePackage(input: PackageNormalizationInput): NormalizedPackage | null {
  const normalized = normalizeQuantity(input.quantity, input.unit)
  if (!normalized) return null
  const hasMultipack = input.packageCount != null || input.packageUnitQuantity != null || input.packageUnit != null
  if (!hasMultipack) return { ...normalized, packageVerified: false }
  if (input.packageCount == null || input.packageUnitQuantity == null || input.packageUnit == null || !Number.isInteger(input.packageCount) || input.packageCount <= 0 || input.packageUnitQuantity <= 0) return { ...normalized, method: 'unknown', confidence: 0, packageVerified: false }
  const declaredTotal = convertQuantity(input.packageUnitQuantity * input.packageCount, input.packageUnit, normalized.unit)
  if (declaredTotal == null) return { ...normalized, method: 'unknown', confidence: 0, packageVerified: false }
  const packageVerified = nearlyEqual(declaredTotal, normalized.quantity)
  return { ...normalized, method: packageVerified ? 'declared_multipack' : 'unknown', confidence: packageVerified ? 1 : 0, packageVerified }
}

function nearlyEqual(a: number, b: number): boolean { const tolerance = Math.max(0.000001, Math.abs(b) * 0.00001); return Math.abs(a - b) <= tolerance }
function round(value: number): number { return Math.round(value * 1_000_000_000) / 1_000_000_000 }