import {
  normalizeProductIdentityText,
  packageQuantitiesEquivalent,
} from '@/lib/product-identity-normalization'

export type ProductIdentityRecord = {
  id?: string
  retailer?: string
  sourceCode?: string
  url?: string
  name?: string
  brand?: string
  ean?: string
  categoryPath?: string[]
}

export type ProductIdentityCandidate = {
  left: ProductIdentityRecord
  right: ProductIdentityRecord
  score: number
  status: 'review_required'
  evidence: {
    exactEan: boolean
    sameRetailer: boolean
    nameSimilarity: number
    brandAgreement: boolean | null
    categoryAgreement: boolean | null
    packageQuantityAgreement: boolean | null
    sharedNameTokens: string[]
    conflictingVariantTokens: string[]
    conflictingProductTypeTokens: string[]
    conflictingPackagingTokens: string[]
  }
  reasons: string[]
}

const VARIANT_MARKERS = new Set([
  'sensitive', 'classic', 'delicate', 'camomile', 'aloe', 'fresh', 'freshness',
  'original', 'max', 'plus', 'ultra', 'extra', 'color', 'colour', 'white',
  'black', 'lemon', 'citron', 'lavender', 'neutral', 'baby', 'men', 'women',
  'diamond', 'volume', 'hold',
])

// Small conservative vocabulary of product-kind tokens observed in retail names.
// This is evidence for review, not a universal Czech product taxonomy.
const PRODUCT_TYPE_MARKERS = new Set([
  'kapesnik', 'kapesniky', 'kapesniku', 'tampon', 'tampony', 'tamponu',
  'tycinka', 'tycinky', 'tycinek', 'lak', 'sprej', 'spray', 'ubrousek',
  'ubrousky', 'pleny', 'plenky', 'kartacek', 'kartacky', 'zubni',
])

const PACKAGING_MARKERS = new Set([
  'sacek', 'sacku', 'sackem', 'krabicka', 'krabicce', 'krabicku',
  'box', 'tuba', 'lahev', 'lahvi', 'lahvicka', 'lahvicce', 'doypack',
])

function tokens(value: string | undefined): string[] {
  return normalizeProductIdentityText(value)
    .split(' ')
    .filter((token) => token.length > 1 && !/^\d+(?:\.\d+)?$/.test(token))
}

function tokenSimilarity(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0
  const a = new Set(left)
  const b = new Set(right)
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection += 1
  return intersection / (a.size + b.size - intersection)
}

function normalizedOptional(value: string | undefined): string | null {
  const normalized = normalizeProductIdentityText(value)
  return normalized || null
}

function categoryKey(value: string[] | undefined): string | null {
  if (!value?.length) return null
  return normalizeProductIdentityText(value.join(' '))
}

export function compareProductIdentityRecords(
  left: ProductIdentityRecord,
  right: ProductIdentityRecord,
): ProductIdentityCandidate {
  const leftNameTokens = tokens(left.name)
  const rightNameTokens = tokens(right.name)
  const sharedNameTokens = [...new Set(leftNameTokens.filter((token) => rightNameTokens.includes(token)))].sort()
  const leftVariants = new Set(leftNameTokens.filter((token) => VARIANT_MARKERS.has(token)))
  const rightVariants = new Set(rightNameTokens.filter((token) => VARIANT_MARKERS.has(token)))
  const conflictingVariantTokens = [
    ...[...leftVariants].filter((token) => !rightVariants.has(token)),
    ...[...rightVariants].filter((token) => !leftVariants.has(token)),
  ].sort()
  const leftProductTypes = new Set(leftNameTokens.filter((token) => PRODUCT_TYPE_MARKERS.has(token)))
  const rightProductTypes = new Set(rightNameTokens.filter((token) => PRODUCT_TYPE_MARKERS.has(token)))
  const conflictingProductTypeTokens = leftProductTypes.size > 0 && rightProductTypes.size > 0
    ? [...leftProductTypes.filter((token) => !rightProductTypes.has(token)),
      ...rightProductTypes.filter((token) => !leftProductTypes.has(token))].sort()
    : []
  const leftPackaging = new Set(leftNameTokens.filter((token) => PACKAGING_MARKERS.has(token)))
  const rightPackaging = new Set(rightNameTokens.filter((token) => PACKAGING_MARKERS.has(token)))
  const conflictingPackagingTokens = leftPackaging.size > 0 && rightPackaging.size > 0
    ? [...leftPackaging.filter((token) => !rightPackaging.has(token)),
      ...rightPackaging.filter((token) => !leftPackaging.has(token))].sort()
    : []

  const leftEan = (left.ean ?? '').replace(/\D/g, '')
  const rightEan = (right.ean ?? '').replace(/\D/g, '')
  const exactEan = leftEan.length >= 8 && leftEan === rightEan
  const sameRetailer = Boolean(left.retailer && right.retailer
    && normalizeProductIdentityText(left.retailer) === normalizeProductIdentityText(right.retailer))
  const leftBrand = normalizedOptional(left.brand)
  const rightBrand = normalizedOptional(right.brand)
  const brandAgreement = leftBrand && rightBrand ? leftBrand === rightBrand : null
  const leftCategory = categoryKey(left.categoryPath)
  const rightCategory = categoryKey(right.categoryPath)
  const categoryAgreement = leftCategory && rightCategory ? leftCategory === rightCategory : null
  const packageQuantityAgreement = packageQuantitiesEquivalent(left.name, right.name)
  const nameSimilarity = Number(tokenSimilarity(leftNameTokens, rightNameTokens).toFixed(4))

  const reasons: string[] = []
  let score = 0

  if (exactEan) {
    score += 0.65
    reasons.push('Exact EAN/GTIN agrees')
  }
  score += nameSimilarity * 0.25
  if (brandAgreement === true) {
    score += 0.12
    reasons.push('Brand agrees')
  } else if (brandAgreement === false) {
    score -= 0.12
    reasons.push('Brand conflicts')
  }
  if (categoryAgreement === true) score += 0.05
  else if (categoryAgreement === false) {
    score -= 0.15
    reasons.push('Retail category paths conflict; category taxonomies may differ by retailer')
  }
  if (packageQuantityAgreement === true) {
    score += 0.12
    reasons.push('Package quantities agree after unit normalization')
  } else if (packageQuantityAgreement === false) {
    score -= 0.35
    reasons.push('Package quantities or multipack structure differ')
  } else {
    reasons.push('Package quantity unknown on at least one record')
  }
  if (conflictingVariantTokens.length > 0) {
    score -= 0.2
    reasons.push('Potential variant-token conflict requires review')
  }
  if (conflictingProductTypeTokens.length > 0) {
    score -= 0.35
    reasons.push('Product-kind tokens conflict; likely different product types')
  }
  if (conflictingPackagingTokens.length > 0) {
    score -= 0.25
    reasons.push('Packaging tokens conflict; sales-unit packaging may differ')
  }
  if (sameRetailer) {
    reasons.push('Both records identify the same retailer; retailer codes remain source-scoped')
  }

  return {
    left,
    right,
    score: Number(Math.max(0, Math.min(1, score)).toFixed(4)),
    status: 'review_required',
    evidence: {
      exactEan,
      sameRetailer,
      nameSimilarity,
      brandAgreement,
      categoryAgreement,
      packageQuantityAgreement,
      sharedNameTokens,
      conflictingVariantTokens,
      conflictingProductTypeTokens,
      conflictingPackagingTokens,
    },
    reasons,
  }
}

export function generateProductIdentityCandidates(
  records: ProductIdentityRecord[],
  options: { minimumScore?: number; maxCandidates?: number } = {},
): ProductIdentityCandidate[] {
  const minimumScore = options.minimumScore ?? 0.3
  const maxCandidates = options.maxCandidates ?? 500
  const candidates: ProductIdentityCandidate[] = []

  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      const left = records[i]
      const right = records[j]
      if (!left.name?.trim() || !right.name?.trim()) continue
      if (left.id && right.id && left.id === right.id) continue
      if (left.retailer && right.retailer && left.sourceCode && right.sourceCode
        && normalizeProductIdentityText(left.retailer) === normalizeProductIdentityText(right.retailer)
        && left.sourceCode === right.sourceCode) continue

      const candidate = compareProductIdentityRecords(left, right)
      if (candidate.score < minimumScore) continue
      candidates.push(candidate)
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score
      || normalizeProductIdentityText(a.left.name).localeCompare(normalizeProductIdentityText(b.left.name), 'cs')
      || normalizeProductIdentityText(a.right.name).localeCompare(normalizeProductIdentityText(b.right.name), 'cs'))
    .slice(0, Math.max(0, maxCandidates))
}
