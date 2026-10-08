import { normalizeProductText } from '@/lib/product-normalize'

export const PKD_CANDIDATE_VERSION = '2026-10-v5'

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
  referenceEvidence?: { sourceKind: string; matchedName: string; stableKey?: string }[]
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
    reviewFlags: string[]
    referenceEvidence: { sourceKind: string; matchedName: string; stableKey?: string }[]
    referenceSourceKinds: string[]
  }
}

const valueOrNull = (value?: string | null) => value?.trim() || null

// These are taxonomy/group labels or package bundles, not one purchasable product identity.
// Keep this list conservative: uncertain names remain candidates for human review.
const NON_PRODUCT_LABELS = new Set([
  'potraviny',
  'napoje',
  'slazene napoje',
  'alkoholicke napoje',
  'nealkoholicke napoje',
  'variety packy svacin',
  'variety packy',
  'potravinove vyrobky',
  'jidlo',
  'ostatni potraviny',
])

const normalizeName = (value: string) => normalizeProductText(value)

function reviewFlagsFor(entries: PkdCandidateInput[], canonicalName: string): string[] {
  const flags: string[] = []
  const normalized = normalizeName(canonicalName)
  const sourceKinds = new Set(entries.map((entry) => entry.sourceKind ?? 'unknown'))
  if (sourceKinds.size < 2) flags.push('single_source')
  if (!entries.some((entry) => valueOrNull(entry.category))) flags.push('category_unknown')
  if (!entries.some((entry) => valueOrNull(entry.comparisonUnit))) flags.push('comparison_unit_unknown')
  if (/\b(pack|packy|sada|set)\b/i.test(normalized)) flags.push('possible_bundle_or_pack')
  if (/\b(zn[oó]jem|brn[eě]n|slov[aá]ck|velkopavlov|třeboň|trebon|šobes|sobes|williams)\w*/i.test(canonicalName)) {
    flags.push('possible_region_or_named_variant')
  }
  if (entries.every((entry) => entry.status !== 'approved')) flags.push('no_approved_source_entry')
  const referenceKinds = new Set(entries.flatMap((entry) => entry.referenceEvidence ?? []).map((item) => item.sourceKind))
  if (referenceKinds.size === 0) flags.push('reference_corroboration_missing')
  else if (referenceKinds.size === 1) flags.push('reference_corroboration_single_source')
  return flags.sort()
}

/**
 * Existing Product Type names are checked case/accent/punctuation-insensitively.
 * This generator only proposes new identities; it does not approve or classify them.
 */
export function generatePkdProductTypeCandidates(
  inputs: PkdCandidateInput[],
  existingProductTypeNames: string[] = [],
): PkdProductTypeCandidate[] {
  const existingNames = new Set(existingProductTypeNames.map(normalizeName).filter(Boolean))
  const groups = new Map<string, PkdCandidateInput[]>()

  for (const input of inputs) {
    if (input.productTypeId) continue
    if (input.status === 'rejected' || input.status === 'inactive') continue
    if (input.candidateEligible === false) continue

    const normalizedName = normalizeName(input.canonicalName)
    const language = input.language.trim().toLowerCase() || 'und'
    if (!normalizedName || existingNames.has(normalizedName) || NON_PRODUCT_LABELS.has(normalizedName)) continue

    const key = `${language}:${normalizedName}`
    const group = groups.get(key) ?? []
    group.push(input)
    groups.set(key, group)
  }

  return [...groups.entries()]
    .map(([candidateKey, entries]) => {
      const orderedEntries = [...entries].sort((a, b) => {
        const approvedDifference = Number(b.status === 'approved') - Number(a.status === 'approved')
        if (approvedDifference !== 0) return approvedDifference
        return a.canonicalName.trim().localeCompare(b.canonicalName.trim(), 'cs', { sensitivity: 'base' })
          || a.canonicalName.trim().localeCompare(b.canonicalName.trim())
          || a.id.localeCompare(b.id)
      })
      const first = orderedEntries[0]
      const approvedEntryCount = entries.filter((entry) => entry.status === 'approved').length
      const normalizedName = normalizeName(first.canonicalName)
      const sourceEntryIds = entries.map((entry) => entry.id).sort()
      const sourceKinds = [...new Set(entries.map((entry) => entry.sourceKind ?? 'unknown'))].sort()
      const reviewFlags = reviewFlagsFor(entries, first.canonicalName)
      const referenceEvidence = [...new Map(entries.flatMap((entry) => entry.referenceEvidence ?? [])
        .map((item) => [`${item.sourceKind}:${normalizeName(item.matchedName)}:${item.stableKey ?? ''}`, item])).values()]
        .sort((a, b) => a.sourceKind.localeCompare(b.sourceKind) || a.matchedName.localeCompare(b.matchedName, 'cs'))
      const referenceSourceKinds = [...new Set(referenceEvidence.map((item) => item.sourceKind))].sort()

      // A single taxonomy label is weak evidence. Confidence is deliberately conservative and
      // does not represent approval; missing category/unit always stays unknown rather than guessed.
      const qualityPenalty = reviewFlags.some((flag) =>
        flag === 'possible_region_or_named_variant' || flag === 'possible_bundle_or_pack',
      ) ? 0.10 : 0
      const confidence = Math.max(0.35, Math.min(0.85, 0.55 + Math.max(0, sourceKinds.length - 1) * 0.10
        + (approvedEntryCount > 0 ? 0.05 : 0)
        + (entries.some((entry) => valueOrNull(entry.category)) ? 0.05 : 0)
        + (entries.some((entry) => valueOrNull(entry.comparisonUnit)) ? 0.05 : 0)
        + (referenceSourceKinds.length >= 2 ? 0.05 : 0)
        - qualityPenalty))

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
          sourceEntryCount: entries.length,
          approvedEntryCount,
          unmappedEntryCount: entries.length,
          sourceEntryIds,
          sourceKinds,
          normalization: 'normalizeProductText + language; existing Product Types checked case/accent-insensitively',
          reason: 'unmapped_retail_product_identity' as const,
          reviewFlags,
          referenceEvidence,
          referenceSourceKinds,
        },
      }
    })
    .sort((a, b) => a.candidateKey.localeCompare(b.candidateKey))
}
