import { normalizeProductText } from '@/lib/product-normalize'

export const PKD_CANDIDATE_VERSION = '2026-10-v1'

export type PkdCandidateInput = {
  id: string
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
    normalization: string
    reason: 'unmapped_pkd_identity'
  }
}

const valueOrNull = (value?: string | null) => value?.trim() || null

export function generatePkdProductTypeCandidates(inputs: PkdCandidateInput[]): PkdProductTypeCandidate[] {
  const groups = new Map<string, PkdCandidateInput[]>()

  for (const input of inputs) {
    if (input.productTypeId) continue
    if (input.status === 'rejected' || input.status === 'inactive') continue

    const normalizedName = normalizeProductText(input.canonicalName)
    const language = input.language.trim().toLowerCase() || 'und'
    if (!normalizedName) continue

    const key = `${language}:${normalizedName}`
    const group = groups.get(key) ?? []
    group.push(input)
    groups.set(key, group)
  }

  return [...groups.entries()]
    .map(([candidateKey, entries]) => {
      const first = entries[0]
      const approvedEntryCount = entries.filter((entry) => entry.status === 'approved').length
      const sourceEntryCount = entries.length
      const confidence = approvedEntryCount > 0 ? 0.90 : 0.75
      const normalizedName = normalizeProductText(first.canonicalName)
      const sourceEntryIds = entries.map((entry) => entry.id)

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
        confidence,
        candidateVersion: PKD_CANDIDATE_VERSION,
        evidence: {
          sourceEntryCount,
          approvedEntryCount,
          unmappedEntryCount: entries.length,
          sourceEntryIds,
          normalization: 'normalizeProductText + language',
          reason: 'unmapped_pkd_identity' as const,
        },
      }
    })
    .sort((a, b) => a.candidateKey.localeCompare(b.candidateKey))
}
