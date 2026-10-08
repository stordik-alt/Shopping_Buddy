import { normalizeProductText } from '@/lib/product-normalize'
import { classifyReceiptLineType } from '@/lib/product-types'
import type { ItemCategory } from '@/lib/types'

export const PKD_MAPPING_VERSION = '2026-10-v1'

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
  category: ItemCategory
}

export type PkdProductTypeMapping = {
  pkdEntryId: string
  productTypeId: string
  productTypeKey: string
  method: 'exact_name' | 'rule_match'
  confidence: number
  mappingVersion: string
  evidence: {
    canonicalName: string
    normalizedName: string
    matchedText: string
    matchedNormalizedText: string
    category: string | null
    reason: 'exact_product_type_name' | 'unique_product_type_rule'
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
    if (matches.length === 1) return { target: matches[0], matchedText: text }
  }
  return null
}

function ruleMatch(input: PkdMappingInput, targets: ProductTypeMappingTarget[]): ProductTypeMappingTarget | null {
  const category = input.category as ItemCategory | null | undefined
  const key = classifyReceiptLineType(category ?? null, input.canonicalName)
  if (!key) return null
  const target = targets.find((candidate) => candidate.key === key)
  return target ?? null
}

export function generatePkdProductTypeMappings(inputs: PkdMappingInput[], targets: ProductTypeMappingTarget[]): PkdProductTypeMapping[] {
  const result: PkdProductTypeMapping[] = []

  for (const input of inputs) {
    if (input.productTypeId) continue
    if (input.status === 'rejected' || input.status === 'inactive') continue

    const normalizedName = normalizeProductText(input.canonicalName)
    if (!normalizedName) continue

    const exact = exactMatch(input, targets)
    if (exact) {
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
      continue
    }

    const rule = ruleMatch(input, targets)
    if (!rule) continue

    result.push({
      pkdEntryId: input.id,
      productTypeId: rule.id,
      productTypeKey: rule.key,
      method: 'rule_match',
      confidence: input.category ? 0.90 : 0.86,
      mappingVersion: PKD_MAPPING_VERSION,
      evidence: {
        canonicalName: input.canonicalName,
        normalizedName,
        matchedText: input.canonicalName,
        matchedNormalizedText: normalizedName,
        category: input.category ?? null,
        reason: 'unique_product_type_rule',
      },
    })
  }

  return result.sort((a, b) => a.pkdEntryId.localeCompare(b.pkdEntryId))
}
