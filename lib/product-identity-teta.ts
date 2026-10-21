// Pairs Teta's catalog with the products the app already knows.
//
// Teta publishes no barcode, so the only evidence that a Teta product and an existing catalog
// product are the same thing is their name (with the brand in front), their brand and their
// package size (docs/42, docs/43, docs/44). This module finds those pairs and decides what may be
// linked automatically: a link is made only when the evidence is unambiguous, everything else is
// reported for a human to look at (CLAUDE.md section 12 — a name is not an identity; section 33 —
// suspicious data is flagged, not silently resolved).
//
// Two parts:
//   * `loadTetaIdentityCandidates()` — the database side. Blocking uses PostgreSQL's trigram
//     similarity on `products.search_name` (the generated, accent-insensitive column with a GIN
//     index since migration 0039), so 13,000 Teta products against ~59,000 catalog products stay a
//     bounded query instead of 750 million comparisons.
//   * `decideTetaIdentity()` — the pure part. It scores the candidates with the app's shared
//     identity comparison (`compareProductIdentityRecords`) and applies the rules below.
//
// The rules (deterministic, no model, no guesswork):
//
//   auto-link   the candidate's brand is in both names, both sides state the same package, the
//               descriptive words of the Teta name are found in the candidate's name, nothing
//               conflicts (no other variant / product-kind / packaging token, no different model
//               number) and no second candidate comes close (the runner-up is at least 0.1 behind).
//   review      there are candidates, but the evidence is not unambiguous: the decision says which
//               candidate and why the automatic link was refused.
//   none        there is no candidate at all — the product is simply new to the catalog.
//
// A candidate already linked to a *different* Teta SKU is not a candidate: two Teta SKUs are two
// products even when they share a name. Such a product is reported for review instead.

import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { tetaCatalogName, type TetaCatalogProduct } from '@/lib/ingestion/teta-catalog'
import { normalizeProductText } from '@/lib/product-normalize'
import { compareProductIdentityRecords, type ProductIdentityRecord } from '@/lib/product-identity-candidates'
import { normalizeProductIdentityText, parseProductQuantities } from '@/lib/product-identity-normalization'

/** How many catalog products the blocking query offers per Teta product. */
export const TETA_IDENTITY_CANDIDATES_PER_PRODUCT = 8

/** The trigram similarity a catalog product must reach to be a candidate at all. */
export const TETA_IDENTITY_BLOCKING_SIMILARITY = 0.3

/** The share of the Teta name's descriptive words that must also appear in the candidate's name. */
export const TETA_IDENTITY_MIN_NAME_COVERAGE = 0.6

/** How far the second-best candidate must be behind the best one for the match to be unambiguous. */
export const TETA_IDENTITY_RUNNER_UP_GAP = 0.1

/** The package of a product, in the canonical units the catalog uses. */
export type TetaPackageSize = { quantity: number; unit: 'ks' | 'kg' | 'l' }

export type TetaIdentityCandidate = {
  productId: string
  productName: string
  brand?: string
  /** The package sizes the catalog already knows for this product. */
  packages?: TetaPackageSize[]
}

export type TetaIdentityStatus = 'auto' | 'review' | 'none'

export type TetaIdentityDecision = {
  /** Teta's own product code. */
  externalId: string
  /** The name the catalog stores for the product (brand in front). */
  name: string
  status: TetaIdentityStatus
  /** The catalog product to link — only set for an automatic link. */
  productId?: string
  /** The name of that product, for the report. */
  productName?: string
  /** The score of the best candidate. */
  score?: number
  /** Why the decision came out this way. */
  reason: string
  /** Every candidate with its score, best first. */
  candidates: { productId: string; productName: string; score: number; reasons: string[] }[]
}

type CandidateRow = {
  external_id: string
  product_id: string
  product_name: string
  brand: string | null
  packages: { quantity: number; unit: string }[] | null
}

/**
 * The catalog products that could be the same product as each Teta product.
 *
 * The blocking is the trigram similarity on the indexed `products.search_name`; the same pattern
 * the type suggestions use (lib/db/type-suggestions.ts). Only the products that pass the threshold
 * come back, so the scoring that follows works on a handful of rows per Teta product.
 */
export async function loadTetaIdentityCandidates(
  records: { externalId: string; name: string; brand?: string }[],
  options: { limit?: number } = {},
): Promise<Map<string, TetaIdentityCandidate[]>> {
  const byExternalId = new Map<string, TetaIdentityCandidate[]>()
  if (records.length === 0) return byExternalId

  const limit = options.limit ?? TETA_IDENTITY_CANDIDATES_PER_PRODUCT
  const db = getDb()

  // The trigram index compares whole names; the chunking keeps one query's parameter list bounded.
  const CHUNK = 400
  for (let start = 0; start < records.length; start += CHUNK) {
    const chunk = records.slice(start, start + CHUNK)
    const values = sql.join(
      chunk.map((record) => sql`(${record.externalId}::text, ${normalizeProductText(tetaCatalogName(record.name, record.brand))}::text)`),
      sql`, `,
    )
    const result = await db.execute<CandidateRow>(sql`
      SELECT l.external_id, n.product_id, n.product_name, n.brand, n.packages
      FROM (VALUES ${values}) AS l(external_id, text)
      CROSS JOIN LATERAL (
        SELECT p.id AS product_id, p.name AS product_name, p.brand AS brand,
               (SELECT json_agg(json_build_object('quantity', pp.quantity::float8, 'unit', pp.unit))
                FROM product_packages pp WHERE pp.product_id = p.id) AS packages
        FROM products p
        WHERE p.search_name % l.text
          AND similarity(p.search_name, l.text) >= ${TETA_IDENTITY_BLOCKING_SIMILARITY}
        ORDER BY p.search_name <-> l.text
        LIMIT ${limit}
      ) AS n
    `)
    for (const row of result.rows) {
      const list = byExternalId.get(row.external_id) ?? []
      list.push({
        productId: row.product_id,
        productName: row.product_name,
        ...(row.brand ? { brand: row.brand } : {}),
        ...(row.packages?.length ? { packages: row.packages as TetaPackageSize[] } : {}),
      })
      byExternalId.set(row.external_id, list)
    }
  }
  return byExternalId
}

/** The words of a name, the way the identity comparison counts them. */
function nameTokens(value: string): string[] {
  return normalizeProductIdentityText(value)
    .split(' ')
    .filter((token) => token.length > 1 && !/^\d+(?:\.\d+)?$/.test(token))
}

/**
 * The model numbers a name states — the digits that tell two variants of a product apart
 * ("CURAPROX CS 5460" against "CURAPROX CS 3960").
 *
 * The shared identity comparison does not look at digits (it drops pure numbers from the name),
 * because a number is usually a package size. A model number is the exception, so it is read here:
 * digits that are not part of a package size and not a percentage.
 *
 * A single digit is left out on purpose: "3D" and "5-in-1" are too common to tell two variants
 * apart, and treating them as model numbers would turn unrelated products into a conflict.
 */
export function modelNumbers(name: string): string[] {
  const text = name.toLocaleLowerCase('cs-CZ')
  const found = new Set<string>()
  // A digit run has to be a whole run: "200" is one number, not "20".
  for (const match of text.matchAll(/(\d+)(?!\d)/g)) {
    const digits = match[1]
    if (digits.length < 2 || digits.length > 5) continue
    const start = match.index ?? 0
    const rest = text.slice(start + digits.length)
    // A package size ("250 ml"), a multipack count ("44 x") or a percentage ("40 %") states a size,
    // not a model.
    if (/^[ \t]*(?:kg|g|ml|l|ks)\b/.test(rest)) continue
    if (/^[ \t]*[x×]/.test(rest)) continue
    if (/^[ \t]*%/.test(rest)) continue
    // The rest of a Czech thousands group ("1 000" — the "000" of it) is not a model number.
    if (/\d\s$/.test(text.slice(0, start))) continue
    found.add(digits)
  }
  return [...found]
}

/**
 * Whether the two names state the same model number.
 *
 * `agree` — both names state model numbers and at least one of them is the same.
 * `conflict` — both state model numbers and none of them is the same: two variants of a product.
 * `null` — one side states no model number, so nothing can be said (unknown is not agreement).
 */
export function compareModelNumbers(left: string[], right: string[]): 'agree' | 'conflict' | null {
  if (left.length === 0 || right.length === 0) return null
  return left.some((value) => right.includes(value)) ? 'agree' : 'conflict'
}

/** The same unit in the catalog's canonical form; `null` when the unit cannot be compared. */
function canonicalUnit(unit: string): 'ks' | 'kg' | 'l' | null {
  const normalized = unit.trim().toLowerCase()
  if (normalized === 'ks') return 'ks'
  if (normalized === 'kg') return 'kg'
  if (normalized === 'l') return 'l'
  if (normalized === 'g') return 'kg'
  if (normalized === 'ml') return 'l'
  return null
}

/**
 * The package sizes a name states, in canonical units (a name is a weak source, a package is not).
 *
 * A multipack name ("8 x 100 g") states the inner size, so the total is what is compared — the
 * same total the catalog's package rows hold.
 */
function packagesFromName(name: string): TetaPackageSize[] {
  const packages: TetaPackageSize[] = []
  for (const quantity of parseProductQuantities(name)) {
    const baseUnit = quantity.baseUnit
    const total = quantity.multipackCount * quantity.baseValue
    if (baseUnit === 'ks') packages.push({ quantity: total, unit: 'ks' })
    else if (baseUnit === 'g') packages.push({ quantity: total / 1000, unit: 'kg' })
    else if (baseUnit === 'ml') packages.push({ quantity: total / 1000, unit: 'l' })
  }
  return packages
}

/**
 * Whether the Teta package and the catalog package are the same size.
 *
 * `true` — both sides state the size and it is the same. `false` — both state it and they differ.
 * `null` — one side does not state a size, so nothing can be said (unknown is not agreement).
 *
 * Both sides fall back to the size their name states, so the comparison stays symmetric: a Teta
 * product whose page has not been read yet is compared the same way as a catalog product whose
 * package row was derived from its name.
 */
export function compareTetaPackages(
  teta: { package?: TetaPackageSize | null; name: string },
  candidate: { packages?: TetaPackageSize[]; productName: string },
): boolean | null {
  const tetaSizes = teta.package ? [teta.package] : packagesFromName(teta.name)
  if (tetaSizes.length === 0) return null
  const candidateSizes = candidate.packages?.length ? candidate.packages : packagesFromName(candidate.productName)
  if (candidateSizes.length === 0) return null

  return tetaSizes.some((tetaSize) => {
    const tetaUnit = canonicalUnit(tetaSize.unit)
    if (!tetaUnit) return false
    return candidateSizes.some((candidateSize) => {
      const unit = canonicalUnit(candidateSize.unit)
      if (!unit || unit !== tetaUnit) return false
      return Math.abs(candidateSize.quantity - tetaSize.quantity) < 0.001
    })
  })
}

/**
 * Decides what to do with one Teta product.
 *
 * `linkedProductIds` maps a catalog product id to the Teta SKU it is already linked to; a candidate
 * linked to a different SKU is a different product and is not considered at all.
 */
export function decideTetaIdentity(
  record: { externalId: string; name: string; brand?: string; package?: TetaPackageSize | null },
  candidates: TetaIdentityCandidate[],
  options: { linkedProductIds?: ReadonlyMap<string, string> } = {},
): TetaIdentityDecision {
  const name = tetaCatalogName(record.name, record.brand)
  const brandTokens = nameTokens(record.brand ?? '')
  const tetaModelNumbers = modelNumbers(name)
  const left: ProductIdentityRecord = { name, brand: record.brand, retailer: 'teta' }

  const scored = candidates
    .map((candidate) => {
      const comparison = compareProductIdentityRecords(left, {
        name: candidate.productName,
        ...(candidate.brand ? { brand: candidate.brand } : {}),
      })
      const packageAgreement = compareTetaPackages(
        { package: record.package, name },
        { packages: candidate.packages, productName: candidate.productName },
      )
      const modelAgreement = compareModelNumbers(tetaModelNumbers, modelNumbers(candidate.productName))
      // The shared comparison only sees the package when both names state it; the catalog's own
      // package rows are the stronger evidence, so the score follows them. The same goes for the
      // model number: a variant the model number rules out is not the same product, whatever the
      // words say.
      const score = Number(
        (
          comparison.score
          + (packageAgreement === true ? 0.12 : packageAgreement === false ? -0.35 : 0)
          + (modelAgreement === 'agree' ? 0.08 : modelAgreement === 'conflict' ? -0.3 : 0)
        ).toFixed(4),
      )
      return { candidate, comparison, packageAgreement, modelAgreement, score }
    })
    .sort((a, b) => b.score - a.score)

  const summary = scored.map(({ candidate, comparison, score }) => ({
    productId: candidate.productId,
    productName: candidate.productName,
    score,
    reasons: comparison.reasons,
  }))

  const usable = scored.filter(({ candidate }) => {
    const linked = options.linkedProductIds?.get(candidate.productId)
    return linked === undefined || linked === record.externalId
  })
  const best = usable[0]
  if (!best) {
    const claimed = candidates.length > 0
    return {
      externalId: record.externalId,
      name,
      status: claimed ? 'review' : 'none',
      reason: claimed
        ? 'the similar catalog product is already linked to another Teta product'
        : 'no catalog product is similar enough',
      candidates: summary,
    }
  }

  const evidence = best.comparison.evidence
  const runnerUp = usable[1]
  const gapOk = !runnerUp || best.score - runnerUp.score >= TETA_IDENTITY_RUNNER_UP_GAP

  // The brand has to be in both names: the catalog product's own brand column is usually empty
  // (only the Teta import fills it), so the names are what carry the brand.
  const candidateTokens = nameTokens(best.candidate.productName)
  const brandAgrees = brandTokens.length === 0
    || brandTokens.every((token) => candidateTokens.includes(token))
    || (best.candidate.brand !== undefined
      && normalizeProductIdentityText(best.candidate.brand) === normalizeProductIdentityText(record.brand ?? ''))

  // The descriptive words of the Teta name (the brand and the numbers aside) have to be found in
  // the candidate's name too — that is what tells two products of the same brand and size apart.
  const descriptiveTokens = nameTokens(name).filter((token) => !brandTokens.includes(token))
  const coverage = descriptiveTokens.length === 0
    ? 1
    : descriptiveTokens.filter((token) => candidateTokens.includes(token)).length / descriptiveTokens.length

  const noConflict =
    evidence.conflictingVariantTokens.length === 0 &&
    evidence.conflictingProductTypeTokens.length === 0 &&
    evidence.conflictingPackagingTokens.length === 0

  const reasons: string[] = []
  if (best.packageAgreement !== true) {
    reasons.push(
      best.packageAgreement === false
        ? 'the package sizes differ'
        : 'the package size is not stated on both sides',
    )
  }
  if (!brandAgrees) reasons.push('the brand is not in both names')
  if (coverage < TETA_IDENTITY_MIN_NAME_COVERAGE) reasons.push('the names describe different products')
  if (evidence.conflictingVariantTokens.length > 0) reasons.push('variant token conflict')
  if (evidence.conflictingProductTypeTokens.length > 0) reasons.push('product-kind token conflict')
  if (evidence.conflictingPackagingTokens.length > 0) reasons.push('packaging token conflict')
  if (best.modelAgreement === 'conflict') reasons.push('the model numbers differ')
  if (!gapOk) reasons.push('a second candidate is just as close')

  if (reasons.length === 0) {
    return {
      externalId: record.externalId,
      name,
      status: 'auto',
      productId: best.candidate.productId,
      productName: best.candidate.productName,
      score: best.score,
      reason: 'same brand, same package, the same descriptive words, no conflict, and no second candidate',
      candidates: summary,
    }
  }

  return {
    externalId: record.externalId,
    name,
    status: 'review',
    score: best.score,
    reason: reasons.join('; '),
    candidates: summary,
  }
}

/** The Teta products of a catalog run, in the shape the identity comparison needs. */
export function tetaIdentityRecords(
  records: TetaCatalogProduct[],
): { externalId: string; name: string; brand?: string; package?: TetaPackageSize | null }[] {
  return records.map((record) => ({
    externalId: record.externalId,
    name: record.name,
    ...(record.brand ? { brand: record.brand } : {}),
    ...(record.package ? { package: { quantity: record.package.quantity, unit: record.package.unit } } : {}),
  }))
}
