import { normalizeProductText } from '@/lib/product-normalize'

export const PKD_CANDIDATE_VERSION = '2026-10-v3'

export type PkdCandidateInput = {
  id: string
  stableKey?: string
  canonicalName: string
  language: string
  category?: string | null
  subcategory?: string | null
  physicalForm?: string | null
  processingState?: string | null
  comparisonUnit?: string | null
  productTypeId?: string | null
  status?: string | null
  confidence?: number | null
  candidateEligible?: boolean
  sourceKind?: string
}

export type PkdProductTypeCandidate = {
  candidateKey: string
  canonicalName: string
  normalizedName: string
  language: string
  category: string | null
  subcategory: string | null
  physicalForm: string | null
  processingState: string | null
  comparisonUnit: string | null
  sourceEntryIds: string[]
  confidence: number
  candidateVersion: string
  evidence: {
    sourceEntryCount: number
    approvedEntryCount: number
    unmappedEntryCount: number
    sourceEntryIds: string[]
    sourceKinds: string[]
    normalization: string
    reason: 'unmapped_retail_product_identity'
  }
}

const valueOrNull = (value?: string | null) => value?.trim() || null

/**
 * Existing internal Product Type names are passed in so candidate generation cannot
 * propose a second identity for a type that differs only by case, accents, or punctuation.
 */
export function generatePkdProductTypeCandidates(
  inputs: PkdCandidateInput[],
  existingProductTypeNames: string[] = [],
): PkdProductTypeCandidate[] {
  const existingNames = new Set(
    existingProductTypeNames.map((name) => normalizeProductText(name)).filter(Boolean),
  )
  const groups = new Map<string, PkdCandidateInput[]>()

  for (const input of inputs) {
    if (input.productTypeId) continue
    if (input.status === 'rejected' || input.status === 'inactive') continue
    if (input.candidateEligible === false) continue

    const normalizedName = normalizeProductText(input.canonicalName)
    const language = input.language.trim().toLowerCase() || 'und'
    if (!normalizedName || existingNames.has(normalizedName)) continue

    const key = `${language}:${normalizedName}`
    const group = groups.get(key) ?? []
    group.push(input)
    groups.set(key, group)
  }

  return [...groups.entries()]
    .map(([candidateKey, entries]) => {
      // Prefer an approved source name, then a deterministic case-insensitive lexical choice.
      // This prevents the stored display name from depending on DB row order (e.g. PAPRIKA vs Paprika).
      const orderedEntries = [...entries].sort((a, b) => {
        const approvedDifference = Number(b.status === 'approved') - Number(a.status === 'approved')
        if (approvedDifference !== 0) return approvedDifference
        return a.canonicalName.trim().localeCompare(b.canonicalName.trim(), 'cs', { sensitivity: 'base' })
          || a.canonicalName.trim().localeCompare(b.canonicalName.trim())
          || a.id.localeCompare(b.id)
      })
      const first = orderedEntries[0]
      const approvedEntryCount = entries.filter((entry) => entry.status === 'approved').length
      const normalizedName = normalizeProductText(first.canonicalName)
      const sourceEntryIds = entries.map((entry) => entry.id).sort()
      const sourceKinds = [...new Set(entries.map((entry) => entry.sourceKind ?? 'unknown'))].sort()

      return {
        candidateKey,
        canonicalName: first.canonicalName.trim(),
        normalizedName,
        language: first.language.trim().toLowerCase() || 'und',
        category: valueOrNull(first.category),
        subcategory: valueOrNull(first.subcategory),
        physicalForm: valueOrNull(first.physicalForm),
        processingState: valueOrNull(first.processingState),
        comparisonUnit: valueOrNull(first.comparisonUnit),
        sourceEntryIds,
        confidence: approvedEntryCount > 0 ? 0.90 : 0.75,
        candidateVersion: PKD_CANDIDATE_VERSION,
        evidence: {
          sourceEntryCount: entries.length,
          approvedEntryCount,
          unmappedEntryCount: entries.length,
          sourceEntryIds,
          sourceKinds,
          normalization: 'normalizeProductText + language; existing Product Types checked case/accent-insensitively',
          reason: 'unmapped_retail_product_identity' as const,
        },
      }
    })
    .sort((a, b) => a.candidateKey.localeCompare(b.candidateKey))
}
