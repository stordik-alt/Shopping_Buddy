import { normalizeProductText } from '@/lib/product-normalize'

export const PKD_MAPPING_VERSION = '2026-10-v2'

export type PkdMappingInput = {
  id: string
  canonicalName: string
  language: string
  category?: string | null
  productTypeId?: string | null
  status?: string | null
  synonyms?: string[]
}

export type ProductTypeMappingTarget = {
  id: string
  key: string
  name: string
  category: string
}

export type PkdProductTypeMapping = {
  pkdEntryId: string
  productTypeId: string
  productTypeKey: string
  method: 'exact_name'
  confidence: number
  mappingVersion: string
  evidence: {
    canonicalName: string
    normalizedName: string
    matchedText: string
    matchedNormalizedText: string
    category: string | null
    reason: 'exact_product_type_name'
  }
}

function exactMatch(input: PkdMappingInput, targets: ProductTypeMappingTarget[]): { target: ProductTypeMappingTarget; matchedText: string } | null {
  const normalizedTargetNames = new Map<string, ProductTypeMappingTarget[]>()
  for (const target of targets) {
    const normalized = normalizeProductText(target.name)
    const group = normalizedTargetNames.get(normalized) ?? []
    group.push(target)
    normalizedTargetNames.set(normalized, group)
  }

  const texts = [input.canonicalName, ...(input.synonyms ?? [])]
  for (const text of texts) {
    const normalized = normalizeProductText(text)
    const matches = normalizedTargetNames.get(normalized) ?? []
    // A name shared by multiple Product Types is ambiguous and must never be guessed.
    if (matches.length === 1) return { target: matches[0], matchedText: text }
  }
  return null
}

/**
 * External taxonomies contain goods, parts, raw materials and services. The receipt-line
 * classifier is intentionally not used here: its broad keyword rules are suitable for noisy
 * receipt text, but unsafe for mapping formal taxonomy names (e.g. "PIVOTAL" -> "Pivo").
 * Only exact normalized Product Type names or reviewed synonyms may create candidates.
 */
export function generatePkdProductTypeMappings(inputs: PkdMappingInput[], targets: ProductTypeMappingTarget[]): PkdProductTypeMapping[] {
  const result: PkdProductTypeMapping[] = []

  for (const input of inputs) {
    if (input.productTypeId) continue
    if (input.status === 'rejected' || input.status === 'inactive') continue

    const normalizedName = normalizeProductText(input.canonicalName)
    if (!normalizedName) continue

    const exact = exactMatch(input, targets)
    if (!exact) continue

    result.push({
      pkdEntryId: input.id,
      productTypeId: exact.target.id,
      productTypeKey: exact.target.key,
      method: 'exact_name',
      confidence: 0.99,
      mappingVersion: PKD_MAPPING_VERSION,
      evidence: {
        canonicalName: input.canonicalName,
        normalizedName,
        matchedText: exact.matchedText,
        matchedNormalizedText: normalizeProductText(exact.matchedText),
        category: input.category ?? null,
        reason: 'exact_product_type_name',
      },
    })
  }

  return result.sort((a, b) => a.pkdEntryId.localeCompare(b.pkdEntryId))
}
