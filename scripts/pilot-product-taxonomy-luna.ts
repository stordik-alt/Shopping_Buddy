import fs from 'node:fs'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { normalizeProductText } from '@/lib/product-normalize'
import { getProductTypeCandidateReviewFlags, isSuitableCzechRetailProductTypeCandidate } from '@/lib/product-type-candidate-suitability'
import {
  createLunaProductTaxonomyClassifier,
  PRODUCT_TAXONOMY_CLASSIFIER_PROMPT_VERSION,
  type ProductTaxonomyCandidate,
  type ProductTaxonomyUsage,
} from '@/lib/product-taxonomy-classifier'

const OUTPUT_PATH = '.tmp/product-taxonomy-luna-pilot.json'
const MAX_LIMIT = 500
const DEFAULT_LIMIT = 300

function cmp(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0 }
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
function parseLimit(): number {
  const index = process.argv.indexOf('--limit')
  if (index < 0) return DEFAULT_LIMIT
  const value = Number(process.argv[index + 1])
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw new Error(`--limit must be an integer between 1 and ${MAX_LIMIT}`)
  }
  return value
}

/** Round-robin over candidate version and initial-letter buckets for a repeatable, less alphabet-biased pilot. */
export function selectProductTaxonomyPilotRows<T extends {
  canonicalName: string
  normalizedName: string
  candidateVersion: string
}>(rows: T[], limit: number): T[] {
  const buckets = new Map<string, T[]>()
  for (const row of [...rows].sort((a, b) =>
    cmp(a.candidateVersion, b.candidateVersion)
      || cmp(normalizeProductText(a.normalizedName || a.canonicalName), normalizeProductText(b.normalizedName || b.canonicalName)),
  )) {
    const normalized = normalizeProductText(row.normalizedName || row.canonicalName)
    const firstLetter = normalized[0] ?? '#'
    const key = `${row.candidateVersion}|${firstLetter}`
    const bucket = buckets.get(key) ?? []
    bucket.push(row)
    buckets.set(key, bucket)
  }
  const keys = [...buckets.keys()].sort(cmp)
  const selected: T[] = []
  while (selected.length < limit) {
    let found = false
    for (const key of keys) {
      const row = buckets.get(key)?.shift()
      if (!row) continue
      selected.push(row)
      found = true
      if (selected.length >= limit) break
    }
    if (!found) break
  }
  return selected
}

async function main() {
  const limit = parseLimit()
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error('AI_GATEWAY_API_KEY is required for the GPT-6 Luna pilot.')
  }
  const db = getDb()
  const [candidateRows, typeRows] = await Promise.all([
    db.select({
      id: schema.pkdProductTypeCandidates.id,
      candidateKey: schema.pkdProductTypeCandidates.candidateKey,
      canonicalName: schema.pkdProductTypeCandidates.canonicalName,
      normalizedName: schema.pkdProductTypeCandidates.normalizedName,
      language: schema.pkdProductTypeCandidates.language,
      category: schema.pkdProductTypeCandidates.category,
      subcategory: schema.pkdProductTypeCandidates.subcategory,
      status: schema.pkdProductTypeCandidates.status,
      evidence: schema.pkdProductTypeCandidates.evidence,
      candidateVersion: schema.pkdProductTypeCandidates.candidateVersion,
    }).from(schema.pkdProductTypeCandidates),
    db.select({
      key: schema.productTypes.key,
      name: schema.productTypes.name,
      category: schema.productTypes.category,
    }).from(schema.productTypes),
  ])

  const eligible = candidateRows.filter((row) =>
    row.status === 'candidate'
      && row.language === 'cs'
      && isSuitableCzechRetailProductTypeCandidate(row.canonicalName, row.language),
  )
  const sample = selectProductTaxonomyPilotRows(eligible, limit)
  if (sample.length < Math.min(limit, 30)) {
    throw new Error(`Only ${sample.length} suitable candidates found; refusing to run a pilot smaller than 30 rows.`)
  }

  const classifier = createLunaProductTaxonomyClassifier()
  const existingTypes = typeRows.map((row) => ({
    key: row.key,
    name: row.name,
    categories: row.category ? [row.category] : [],
  }))
  const results: Array<Record<string, unknown>> = []
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let succeeded = 0
  let failed = 0

  for (let index = 0; index < sample.length; index += 1) {
    const row = sample[index]
    const evidence = (row.evidence ?? {}) as Record<string, unknown>
    const candidate: ProductTaxonomyCandidate = {
      name: row.canonicalName,
      language: row.language,
      categoryHint: row.category,
      subcategoryHint: row.subcategory,
      czCpaCode: stringValue(evidence.czCpaCode) ?? stringValue(evidence.cz_cpa_code),
      gs1Gpc: stringValue(evidence.gs1Gpc) ?? stringValue(evidence.gpcCode),
      openFoodFactsTags: strings(evidence.openFoodFactsTags ?? evidence.offTags),
      source: row.candidateVersion,
    }
    let usage: ProductTaxonomyUsage = {}
    try {
      const classification = await classifier.classify(candidate, { existingTypes }, {
        onUsage: (value) => { usage = value },
      })
      totalInputTokens += usage.inputTokens ?? 0
      totalOutputTokens += usage.outputTokens ?? 0
      succeeded += 1
      results.push({
        candidateId: row.id,
        candidateKey: row.candidateKey,
        name: row.canonicalName,
        reviewFlags: getProductTypeCandidateReviewFlags(row.canonicalName, row.language),
        classification,
        usage,
      })
    } catch (error) {
      failed += 1
      results.push({
        candidateId: row.id,
        candidateKey: row.candidateKey,
        name: row.canonicalName,
        error: error instanceof Error ? error.message : String(error),
        usage,
      })
    }
    if ((index + 1) % 25 === 0 || index + 1 === sample.length) {
      process.stdout.write(`Processed ${index + 1}/${sample.length} candidates\n`)
    }
  }

  const statusCounts: Record<string, number> = {}
  const confidenceBuckets: Record<string, number> = { '0.00-0.49': 0, '0.50-0.79': 0, '0.80-0.89': 0, '0.90-1.00': 0 }
  for (const result of results) {
    const classification = result.classification as { status?: string; confidence?: number } | undefined
    if (!classification) continue
    statusCounts[classification.status ?? 'unknown'] = (statusCounts[classification.status ?? 'unknown'] ?? 0) + 1
    const confidence = classification.confidence ?? 0
    const bucket = confidence < 0.5 ? '0.00-0.49' : confidence < 0.8 ? '0.50-0.79' : confidence < 0.9 ? '0.80-0.89' : '0.90-1.00'
    confidenceBuckets[bucket] += 1
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'read-only-model-pilot',
    model: classifier.id,
    promptVersion: PRODUCT_TAXONOMY_CLASSIFIER_PROMPT_VERSION,
    policy: 'Read-only candidate selection and model inference. No INSERT/UPDATE/DELETE, no taxonomy creation, no approvals and no product assignments.',
    sample: {
      requestedLimit: limit,
      eligibleCandidates: eligible.length,
      processed: sample.length,
      sampling: 'Deterministic round-robin over candidateVersion and normalized-name initial-letter buckets.',
    },
    result: {
      succeeded,
      failed,
      statusCounts: Object.fromEntries(Object.entries(statusCounts).sort(([a], [b]) => cmp(a, b))),
      confidenceBuckets,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      cost: null,
      costNote: 'Cost is not estimated because current GPT-6 Luna gateway pricing was not retrieved. Use token totals with the active provider pricing.',
    },
    results,
  }
  fs.mkdirSync('.tmp', { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8')
  process.stdout.write(JSON.stringify({ ...report, results: undefined, outputPath: OUTPUT_PATH }, null, 2) + '\n')
  if (failed > 0) process.exitCode = 1
}

void main()
