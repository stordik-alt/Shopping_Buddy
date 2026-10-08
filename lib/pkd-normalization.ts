import { normalizeProductText } from '@/lib/product-normalize'

export const PKD_NORMALIZATION_VERSION = '2026-10-v1'

export type PkdNormalizationMethod = 'unicode_fold' | 'whitespace_fold' | 'punctuation_fold' | 'alias_fold'

export type PkdNormalizationInput = {
  id: string
  canonicalName: string
  language: string
  category?: string | null
  subcategory?: string | null
  physicalForm?: string | null
  processingState?: string | null
}

export type PkdNormalization = {
  entryId: string
  normalizationVersion: string
  normalizedName: string
  identityKey: string
  methods: PkdNormalizationMethod[]
}

export type PkdDedupCandidate = {
  leftEntryId: string
  rightEntryId: string
  normalizationVersion: string
  reason: 'exact_normalized_name'
  confidence: number
  evidence: {
    normalizedName: string
    language: string
    categoryCompatible: boolean
    subcategoryCompatible: boolean
    physicalFormCompatible: boolean
    processingStateCompatible: boolean
  }
}

const cleanDimension = (value: string | null | undefined): string | null => {
  const normalized = value ? normalizeProductText(value) : ''
  return normalized || null
}

export function normalizePkdEntry(input: PkdNormalizationInput): PkdNormalization {
  const normalizedName = normalizeProductText(input.canonicalName)
  const language = input.language.trim().toLowerCase() || 'und'

  return {
    entryId: input.id,
    normalizationVersion: PKD_NORMALIZATION_VERSION,
    normalizedName,
    identityKey: `${language}:${normalizedName}`,
    methods: ['unicode_fold', 'punctuation_fold', 'whitespace_fold'],
  }
}

function compatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = cleanDimension(a)
  const right = cleanDimension(b)
  return left === null || right === null || left === right
}

export function findPkdDedupCandidates(entries: PkdNormalizationInput[]): PkdDedupCandidate[] {
  const normalized = entries
    .map((entry) => ({ entry, normalization: normalizePkdEntry(entry) }))
    .filter(({ normalization }) => Boolean(normalization.normalizedName))

  const groups = new Map<string, typeof normalized>()
  for (const item of normalized) {
    const group = groups.get(item.normalization.identityKey) ?? []
    group.push(item)
    groups.set(item.normalization.identityKey, group)
  }

  const candidates: PkdDedupCandidate[] = []
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const left = group[i]
        const right = group[j]
        if (
          !compatible(left.entry.category, right.entry.category) ||
          !compatible(left.entry.subcategory, right.entry.subcategory) ||
          !compatible(left.entry.physicalForm, right.entry.physicalForm) ||
          !compatible(left.entry.processingState, right.entry.processingState)
        ) continue

        const sameCategory = cleanDimension(left.entry.category) === cleanDimension(right.entry.category)
        const sameSubcategory = cleanDimension(left.entry.subcategory) === cleanDimension(right.entry.subcategory)
        const sameForm = cleanDimension(left.entry.physicalForm) === cleanDimension(right.entry.physicalForm)
        const sameProcessing = cleanDimension(left.entry.processingState) === cleanDimension(right.entry.processingState)

        candidates.push({
          leftEntryId: left.entry.id,
          rightEntryId: right.entry.id,
          normalizationVersion: PKD_NORMALIZATION_VERSION,
          reason: 'exact_normalized_name',
          confidence: sameCategory && sameSubcategory && sameForm && sameProcessing ? 0.98 : 0.94,
          evidence: {
            normalizedName: left.normalization.normalizedName,
            language: left.entry.language.trim().toLowerCase() || 'und',
            categoryCompatible: sameCategory,
            subcategoryCompatible: sameSubcategory,
            physicalFormCompatible: sameForm,
            processingStateCompatible: sameProcessing,
          },
        })
      }
    }
  }

  return candidates
}
