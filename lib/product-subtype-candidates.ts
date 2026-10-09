export const PRODUCT_SUBTYPE_CANDIDATE_SOURCE_TYPES = [
  'retailer',
  'gs1_gpc',
  'open_food_facts',
  'cz_cpa',
  'ocr',
  'manual',
] as const

export type ProductSubtypeCandidateSource = (typeof PRODUCT_SUBTYPE_CANDIDATE_SOURCE_TYPES)[number]

export type ProductSubtypeCandidateInput = {
  parentTypeKey: string
  name: string
  definition?: string
  includes?: string[]
  excludes?: string[]
  sourceType: ProductSubtypeCandidateSource
  sourceName: string
  sourceVersion?: string
  sourceRecordIds?: string[]
  evidence?: Record<string, unknown>
}

export type NormalizedProductSubtypeCandidate = ProductSubtypeCandidateInput & {
  candidateKey: string
  normalizedName: string
  definition: string
  includes: string[]
  excludes: string[]
  sourceRecordIds: string[]
  evidence: Record<string, unknown>
}

export function normalizeSubtypeLabel(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function subtypeSlug(value: string): string {
  return normalizeSubtypeLabel(value).replace(/\s+/g, '-')
}

export function normalizeProductSubtypeCandidate(
  input: ProductSubtypeCandidateInput,
): NormalizedProductSubtypeCandidate {
  const parentTypeKey = input.parentTypeKey.trim()
  const name = input.name.trim().replace(/\s+/g, ' ')
  const normalizedName = normalizeSubtypeLabel(name)
  if (!parentTypeKey) throw new Error('parentTypeKey is required')
  if (!name || !normalizedName) throw new Error('A non-empty subtype name is required')
  if (!PRODUCT_SUBTYPE_CANDIDATE_SOURCE_TYPES.includes(input.sourceType)) {
    throw new Error(`Unsupported sourceType: ${String(input.sourceType)}`)
  }
  if (!input.sourceName.trim()) throw new Error('sourceName is required')

  const slug = subtypeSlug(name)
  if (!slug) throw new Error('Subtype name cannot produce a stable key')
  return {
    ...input,
    parentTypeKey,
    name,
    candidateKey: `${subtypeSlug(parentTypeKey)}-${slug}`,
    normalizedName,
    definition: input.definition?.trim() ?? '',
    includes: uniqueNormalizedStrings(input.includes ?? []),
    excludes: uniqueNormalizedStrings(input.excludes ?? []),
    sourceRecordIds: [...new Set((input.sourceRecordIds ?? []).map((value) => value.trim()).filter(Boolean))],
    evidence: input.evidence ?? {},
  }
}

function uniqueNormalizedStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, ' ')
    const normalized = normalizeSubtypeLabel(value)
    if (!value || !normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(value)
  }
  return result
}

export function canApproveProductSubtypeCandidate(
  candidate: Pick<NormalizedProductSubtypeCandidate, 'definition' | 'includes' | 'excludes'>,
): { approved: true } | { approved: false; missing: string[] } {
  const missing: string[] = []
  if (candidate.definition.trim().length < 20) missing.push('definition (at least 20 characters)')
  if (candidate.includes.length === 0) missing.push('at least one includes example/boundary')
  if (candidate.excludes.length === 0) missing.push('at least one excludes example/boundary')
  return missing.length ? { approved: false, missing } : { approved: true }
}

export function deduplicateProductSubtypeCandidates(
  inputs: readonly ProductSubtypeCandidateInput[],
): NormalizedProductSubtypeCandidate[] {
  const deduped = new Map<string, NormalizedProductSubtypeCandidate>()
  for (const input of inputs) {
    const candidate = normalizeProductSubtypeCandidate(input)
    const previous = deduped.get(candidate.candidateKey)
    if (!previous) {
      deduped.set(candidate.candidateKey, candidate)
      continue
    }
    deduped.set(candidate.candidateKey, {
      ...previous,
      definition: previous.definition || candidate.definition,
      includes: uniqueNormalizedStrings([...previous.includes, ...candidate.includes]),
      excludes: uniqueNormalizedStrings([...previous.excludes, ...candidate.excludes]),
      sourceRecordIds: [...new Set([...previous.sourceRecordIds, ...candidate.sourceRecordIds])],
      evidence: {
        records: [
          ...(Array.isArray(previous.evidence.records) ? previous.evidence.records : [previous.evidence]),
          ...(Array.isArray(candidate.evidence.records) ? candidate.evidence.records : [candidate.evidence]),
        ],
      },
    })
  }
  return [...deduped.values()].sort((a, b) =>
    a.candidateKey === b.candidateKey ? 0 : a.candidateKey < b.candidateKey ? -1 : 1,
  )
}
