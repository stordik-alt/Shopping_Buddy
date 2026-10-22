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
//   auto-link   the candidate's brand is in both names, the two names state the same words,
//               nothing conflicts (no other variant / product-kind / packaging token, no different
//               model number, no different size, no different package size) and no second candidate
//               comes close (the runner-up is at least 0.1 behind).
//
// A package size that only one side states is not a conflict — Teta states no size for a fifth of
// its catalog, and the catalog names a size the Teta page does not. A size both sides state and
// that differs is a conflict, and so is a record whose own numbers describe two different sizes.
//   review      there are candidates, but the evidence is not unambiguous: the decision says which
//               candidate and why the automatic link was refused.
//   none        there is no candidate at all — the product is simply new to the catalog.
//
// "The two names state the same words" is the rule that keeps two variants apart. A word that only
// the Teta name states ("Night", "110", "jablko") and a word that only the catalog name states
// ("Day", "120", "hruška") are both differences — so a link is made only when there is no such
// word. The words that say nothing about which product it is are left out: the words that tie the
// product to something else ("pro vlasy"), the words that state the size (the size is compared on
// its own) and the words that name the type of the product ("vložky", "šampon") — a retailer may
// name the product by its line alone.
//
// A candidate already linked to a *different* Teta SKU is not a candidate: two Teta SKUs are two
// products even when they share a name. Such a product is reported for review instead.

import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { tetaCatalogName, TETA_WARNING_UNIT_PRICE_DISAGREES, type TetaCatalogProduct } from '@/lib/ingestion/teta-catalog'
import { normalizeProductText } from '@/lib/product-normalize'
import { compareProductIdentityRecords, type ProductIdentityRecord } from '@/lib/product-identity-candidates'
import { normalizeProductIdentityText, parseProductQuantities } from '@/lib/product-identity-normalization'
import { isProductKindWord, productKindOf, productKindsCompatible } from '@/lib/product-identity-teta-kinds'
import { wordRelation } from '@/lib/product-search'

/** How many catalog products the blocking query offers per Teta product. */
export const TETA_IDENTITY_CANDIDATES_PER_PRODUCT = 8

/** The trigram similarity a catalog product must reach to be a candidate at all. */
export const TETA_IDENTITY_BLOCKING_SIMILARITY = 0.3

/**
 * The share of the Teta name's descriptive words that must also appear in the candidate's name.
 *
 * All of them: a word that only the Teta name states may be the variant ("Night"), the shade
 * ("černá") or the flavour ("jablko"), and a link is made only when there is no such word.
 */
export const TETA_IDENTITY_MIN_NAME_COVERAGE = 1

/**
 * The words that tie a product to something else — what it is for, not which product it is.
 *
 * "Šampon pro vlasy" is a hair shampoo; the "pro vlasy" says what the product is for, and the
 * "vlasy" is a different thing from a "sprej na vlasy". The word that ties them together is
 * therefore not a word that tells two products apart.
 */
const LINK_WORDS = new Set([
  's', 'se', 'z', 'ze', 'na', 'v', 've', 'do', 'pro', 'bez', 'k', 'ke', 'od', 'po',
  'a', 'i', 'with', 'the', 'of', 'for', 'and', 'in', 'on', 'to', 'my', 'me', 'at', 'it',
])

/**
 * The words that state the size of the package.
 *
 * The size is compared on its own — against the catalog's package rows and against the size the
 * Teta page states — so the words that spell it out say nothing about which product it is. The
 * two retailers also spell the size differently ("200 ml", "0,2 l", "200ml").
 */
const SIZE_WORDS = new Set([
  'ml', 'l', 'kg', 'g', 'mg', 'cl', 'dl', 'ks', 'vel', 'velikost', 'velikosti', 'objem',
  'hmotnost', 'kus', 'd', 'm',
])

/**
 * The words that state how the product is packed — the tube, the bottle, the box.
 *
 * A retailer names the packaging where the other one does not, but a different packaging is a
 * different sales unit, and that is caught by the packaging conflict of the shared comparison.
 */
const PACKAGING_WORDS = new Set([
  'tuba', 'lahev', 'lahvi', 'lahvicka', 'doypack', 'sacek', 'sacku', 'sackem', 'krabicka',
  'krabicce', 'krabicku', 'krabice', 'box', 'baleni', 'obal', 'blistr', 'folie', 'fole', 'balea',
])

/**
 * Whether two words name the same thing.
 *
 * The same word in another form ("kremu" / "krem", "vložky" / "vložka") is the same word; a word
 * built on the same stem ("malina" / "malinová") is not — "banánové chipsy" are not bananas
 * (lib/product-search.ts says the same about the search words).
 */
function sameWord(left: string, right: string): boolean {
  if (left === right) return true
  const forward = wordRelation(left, right)
  if (forward === 'exact' || forward === 'form') return true
  const backward = wordRelation(right, left)
  return backward === 'exact' || backward === 'form'
}

/**
 * The size a name states ("velikost 4", "vel. 3") — the absorbency of a pad, the size of a towel.
 *
 * It is not part of the package: the package is how many pieces the pack holds, the size is which
 * one it is. Two products of one line can hold the same number of pieces and still be two
 * products.
 */
function sizeLabel(name: string): string | null {
  const match = name.toLocaleLowerCase('cs-CZ').match(/\bvel(?:ikost|\.)?\s*(\d+)\b/)
  return match ? match[1] : null
}

/** How far the second-best candidate must be behind the best one for the match to be unambiguous. */
export const TETA_IDENTITY_RUNNER_UP_GAP = 0.1

/**
 * The package of a product.
 *
 * The units are the ones the catalog stores a package in — the canonical ones ("kg", "l", "ks") and
 * the smaller ones the sources state them in ("g", "ml"). The comparison converts them before it
 * compares them.
 */
export type TetaPackageSize = { quantity: number; unit: 'ks' | 'kg' | 'g' | 'l' | 'ml' }

export type TetaIdentityCandidate = {
  productId: string
  productName: string
  brand?: string
  /** The package sizes the catalog already knows for this product. */
  packages?: TetaPackageSize[]
}

export type TetaIdentityStatus = 'auto' | 'review' | 'none'

/** One candidate with the evidence the rules compare. */
type ScoredCandidate = {
  candidate: TetaIdentityCandidate
  comparison: ReturnType<typeof compareProductIdentityRecords>
  /** Whether the two package sizes are the same — `null` when one side states none. */
  packageAgreement: boolean | null
  /** Whether the two model numbers agree — `null` when one side states none. */
  modelAgreement: 'agree' | 'conflict' | null
  score: number
}

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
  /**
   * Every candidate with its score, best first.
   *
   * The blockers and the differing words are per candidate, not only for the one the decision
   * refused: a human who reviews the queue has to be able to see why *each* option was refused
   * before they pick one (docs/44 — the review table).
   */
  candidates: {
    productId: string
    productName: string
    score: number
    reasons: string[]
    /** Why this candidate cannot be the Teta product. */
    blockers: string[]
    /** The words the two names do not share — the words that may tell two products apart. */
    differences: { onlyTeta: string[]; onlyCandidate: string[] }
  }[]
  /**
   * The catalog product this SKU is already linked to, with the score it got.
   *
   * It is not a candidate: it is the import's own earlier conclusion, and the product may even be
   * the one the import created for this very SKU. It is reported apart, so that the report can say
   * how well the existing link fits without counting it as a match.
   */
  ownProduct?: { productId: string; productName: string; score: number }
  /**
   * The candidate the refusal is about — the best candidate that no other Teta product owns.
   *
   * The candidates of a decision may start with a product that another Teta product already has;
   * the refusal is about a different one, and the review table has to show the blockers and the
   * differing words of the product the human is being asked about.
   */
  refusedProduct?: { productId: string; productName: string }
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
 *
 * The catalog product a Teta SKU is already linked to is not a candidate here — the matcher takes
 * that product out of the comparison (see `decideTetaIdentity`), because it is the import's own
 * earlier conclusion and not independent evidence.
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
 * A formula — how many things the product does at once ("3 v 1", "3in1", "2 in 1").
 *
 * It is one word, and it says which product it is: a "3 v 1" shower gel is not the plain one, and
 * the two retailers write it glued ("3v1") or with spaces ("3 v 1"), with a different word in the
 * middle ("in", "v"). So the formula is read as the two numbers it stands for, and the way it was
 * written does not matter.
 *
 * The formula is taken out of the text before the rest of it is read: the number it ends with
 * would otherwise be read as the thousands group of the size that follows it ("3v1 150 ml" would
 * be one thousand one hundred fifty millilitres).
 */
const FORMULA_PATTERN = /(?<![a-z0-9])(\d+)\s*(?:in|v|ve|way)\s*(\d+)(?![a-z0-9])/g

/**
 * The words of a name, with a size or a number that is written glued to the word split off it.
 *
 * A retailer writes "200ml", "2x75ml", "snail92" or "spf50" where another one writes "200 ml",
 * "2 x 75 ml", "Snail 92" or "SPF 50". The words are the same, so they have to be compared the
 * same way — otherwise the words of one name simply do not exist in the other.
 */
function nameTokensSplit(value: string): string[] {
  const formulas: string[] = []
  const text = normalizeProductIdentityText(value).replace(FORMULA_PATTERN, (_match, count: string, second: string) => {
    formulas.push(`${count}in${second}`)
    return ' '
  })
  const tokens: string[] = []
  for (const token of nameTokens(text)) {
    // A token that mixes letters and digits is a word with a number glued to it ("snail92"), or a
    // number with a unit ("200ml"). Both are split; a token that is one or the other is left as it
    // is.
    const parts = token.match(/^[a-z]+$|^[0-9]+$|[a-z]+|[0-9]+/g)
    if (!parts || parts.length < 2) {
      tokens.push(token)
      continue
    }
    for (const part of parts) {
      if (part.length > 1 && !/^\d+(?:\.\d+)?$/.test(part)) tokens.push(part)
    }
  }
  return [...mergeMakeUp(tokens), ...formulas]
}

/**
 * "make up" and "make-up" as one word, the way the other retailer writes it.
 *
 * "make-up" is one product type ("makeup"), and a retailer that writes the hyphen writes it as two
 * words once the punctuation is gone. Left as they are, the two words would stand between two
 * names of the same product.
 */
function mergeMakeUp(tokens: string[]): string[] {
  const merged: string[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] === 'make' && tokens[index + 1] === 'up') {
      merged.push('makeup')
      index += 1
      continue
    }
    merged.push(tokens[index])
  }
  return merged
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
 * `agree` — both names state model numbers and they do not contradict each other.
 * `conflict` — both state model numbers and each of them states one the other does not: two
 *             variants of a product.
 * `null` — one side states no model number, so nothing can be said (unknown is not agreement).
 *
 * The comparison is set-based, not "one shared number is enough". "Infaillible 24H Fresh Wear
 * 110" and "Infaillible 24H Fresh Wear 120" share the "24" of the 24-hour hold, but they are two
 * shades — the shared number says nothing and the differing one says everything. A number that only
 * one side states is extra information ("110" against a name that states no number at all), so it
 * is not a conflict on its own.
 */
export function compareModelNumbers(left: string[], right: string[]): 'agree' | 'conflict' | null {
  if (left.length === 0 || right.length === 0) return null
  const onlyLeft = left.filter((value) => !right.includes(value))
  const onlyRight = right.filter((value) => !left.includes(value))
  if (onlyLeft.length === 0 || onlyRight.length === 0) return 'agree'
  return 'conflict'
}

/** A package size in the unit every size of its kind is compared in: grams, millilitres, pieces. */
type BasePackageSize = { quantity: number; unit: 'g' | 'ml' | 'ks' }

/**
 * The same size in the unit every size of its kind is compared in.
 *
 * The catalog keeps a package in the unit its source stated: one retailer writes "75 ml" where
 * another writes "0,075 l". Comparing the two numbers as they are would call two identical
 * packages different sizes, so the quantity is converted to the base unit of its kind first —
 * grams for a weight, millilitres for a volume, pieces for a count. A unit that is none of these
 * cannot be compared and yields `null`.
 */
function basePackageSize(size: TetaPackageSize): BasePackageSize | null {
  const unit = size.unit.trim().toLowerCase()
  if (unit === 'ks') return { quantity: size.quantity, unit: 'ks' }
  if (unit === 'kg') return { quantity: size.quantity * 1000, unit: 'g' }
  if (unit === 'g') return { quantity: size.quantity, unit: 'g' }
  if (unit === 'l') return { quantity: size.quantity * 1000, unit: 'ml' }
  if (unit === 'ml') return { quantity: size.quantity, unit: 'ml' }
  return null
}

/** Two sizes of the same kind are the same size when they do not differ beyond rounding. */
function sameBaseSize(left: BasePackageSize, right: BasePackageSize): boolean {
  if (left.unit !== right.unit) return false
  const tolerance = Math.max(0.01, Math.max(left.quantity, right.quantity) * 1e-6)
  return Math.abs(left.quantity - right.quantity) <= tolerance
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
 *
 * A record whose own numbers contradict each other states no size at all: the price and the unit
 * price describe a different size than the package statement does, so the record says two
 * different things and nothing can be concluded from it.
 */
export function compareTetaPackages(
  teta: { package?: TetaPackageSize | null; name: string; contradictory?: boolean },
  candidate: { packages?: TetaPackageSize[]; productName: string },
): boolean | null {
  if (teta.contradictory) return null
  const tetaSizes = teta.package ? [teta.package] : packagesFromName(teta.name)
  if (tetaSizes.length === 0) return null
  const candidateSizes = candidate.packages?.length ? candidate.packages : packagesFromName(candidate.productName)
  if (candidateSizes.length === 0) return null

  return tetaSizes.some((tetaSize) => {
    const tetaSizeBase = basePackageSize(tetaSize)
    if (!tetaSizeBase) return false
    return candidateSizes.some((candidateSize) => {
      const candidateBase = basePackageSize(candidateSize)
      if (!candidateBase) return false
      return sameBaseSize(tetaSizeBase, candidateBase)
    })
  })
}

/**
 * Whether the catalog product stands for a group of products rather than for one product.
 *
 * A retailer that lists a line of variants under one name says so in the name ("… (vybrané
 * druhy)"). Such a product is not one product: it is the line, and its price is the price of
 * whichever variant the retailer happens to price. Linking a Teta product to it would make the
 * price of one variant stand for another, so such a candidate is never linked automatically — it
 * goes to the report instead.
 */
export function isVariantGroupProduct(productName: string): boolean {
  const normalized = normalizeProductIdentityText(productName)
  return /\bvybrane\s+(?:druhy|varianty|barvy)\b/.test(normalized)
}

/**
 * One Teta product, as the identity matcher sees it.
 */
export type TetaIdentityRecord = {
  externalId: string
  name: string
  brand?: string
  package?: TetaPackageSize | null
  /**
   * True when the retailer's own numbers contradict each other — the price and the unit price
   * describe a different size than the package statement does. Such a record states no size that
   * can be trusted, so it is never linked automatically.
   */
  contradictory?: boolean
}

/**
 * Decides what to do with one Teta product.
 *
 * `linkedProductIds` maps a catalog product id to the Teta SKU it is already linked to; a candidate
 * linked to a different SKU is a different product and is not considered at all.
 */
export function decideTetaIdentity(
  record: TetaIdentityRecord,
  candidates: TetaIdentityCandidate[],
  options: { linkedProductIds?: ReadonlyMap<string, string> } = {},
): TetaIdentityDecision {
  const name = tetaCatalogName(record.name, record.brand)
  const brandTokens = nameTokensSplit(record.brand ?? '')
  const tetaModelNumbers = modelNumbers(name)
  const tetaSizeLabel = sizeLabel(name)
  const left: ProductIdentityRecord = { name, brand: record.brand, retailer: 'teta' }

  // The words of the Teta name, minus the ones that say nothing about which product it is: the
  // words that tie the product to something else ("pro vlasy"), the words that state the size (the
  // size is compared on its own, against the catalog's package rows) and the words that state the
  // packaging.
  const tetaTokens = nameTokensSplit(name)
  const tetaWords = tetaTokens.filter((token) =>
    !brandTokens.includes(token)
    && !LINK_WORDS.has(token)
    && !SIZE_WORDS.has(token)
    && !PACKAGING_WORDS.has(token))

  // A word that names the *type* of the product ("vložky", "šampon") is not the word that tells
  // two products of one line apart, and a retailer may leave the type out ("always vložky Ultra
  // Secure Night" for "Always Ultra Secure Night hygienické vložky"). Such a word may therefore be
  // missing from the other name — but the types both names state have to be compatible, or the
  // two names are about two different products ("Nivea Creme" and "Nivea Deodorant").
  const tetaDistinguishing = tetaWords.filter((token) => productKindOf(token) === null)
  const tetaKinds = tetaWords.map(productKindOf).filter((kind): kind is number => kind !== null)

  const scored = candidates
    .map((candidate) => {
      const comparison = compareProductIdentityRecords(left, {
        name: candidate.productName,
        ...(candidate.brand ? { brand: candidate.brand } : {}),
      })
      const packageAgreement = compareTetaPackages(
        { package: record.package, name, contradictory: record.contradictory },
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

  // The catalog product this SKU is already linked to is not evidence of a match: the import
  // linked it when the SKU was first imported, and the product may even be the very product the
  // import created for this SKU. Counting it again would make the decision depend on how many
  // times the import has run — the first run would say "no catalog product is similar enough" and
  // every later run would say "a perfect match". The same product, a different answer.
  const own = scored.find(
    ({ candidate }) => options.linkedProductIds?.get(candidate.productId) === record.externalId,
  )
  const compared = scored.filter(
    ({ candidate }) => options.linkedProductIds?.get(candidate.productId) !== record.externalId,
  )

  const summary = compared.map((entry) => {
    const assessment = assessCandidate(entry)
    return {
      productId: entry.candidate.productId,
      productName: entry.candidate.productName,
      score: entry.score,
      reasons: entry.comparison.reasons,
      blockers: assessment.blockers,
      differences: assessment.differences,
    }
  })
  const ownProduct = own
    ? { productId: own.candidate.productId, productName: own.candidate.productName, score: own.score }
    : undefined

  const usable = compared.filter(({ candidate }) => {
    // A candidate that stands for a group of variants is never linked automatically.
    if (isVariantGroupProduct(candidate.productName)) return false
    // A candidate that another Teta SKU already has is not a candidate either: two Teta SKUs are
    // two products, even when they share a name.
    return options.linkedProductIds?.get(candidate.productId) === undefined
  })
  const best = usable[0]
  if (!best) {
    const group = compared.find(({ candidate }) => isVariantGroupProduct(candidate.productName))
    const claimed = compared.length > 0
    return {
      externalId: record.externalId,
      name,
      status: group || claimed ? 'review' : 'none',
      reason: group
        ? 'the similar catalog product is a group of variants, not one product'
        : claimed
          ? 'the similar catalog product is already linked to another Teta product'
          : 'no catalog product is similar enough',
      candidates: summary,
      ...(ownProduct ? { ownProduct } : {}),
    }
  }

  /**
   * Why this candidate cannot be the Teta product — the reasons the two names and the two packages
   * do not agree — and the words the two names do not share.
   */
  function assessCandidate(entry: ScoredCandidate): {
    blockers: string[]
    differences: { onlyTeta: string[]; onlyCandidate: string[] }
  } {
    const evidence = entry.comparison.evidence
    const candidateTokens = nameTokensSplit(entry.candidate.productName)

    // The brand has to be in both names: the catalog product's own brand column is usually empty
    // (only the Teta import fills it), so the names are what carry the brand.
    const brandAgrees = brandTokens.length === 0
      || brandTokens.every((token) => candidateTokens.some((word) => sameWord(word, token)))
      || (entry.candidate.brand !== undefined
        && normalizeProductIdentityText(entry.candidate.brand) === normalizeProductIdentityText(record.brand ?? ''))

    const candidateWords = candidateTokens.filter((token) =>
      !LINK_WORDS.has(token) && !SIZE_WORDS.has(token) && !PACKAGING_WORDS.has(token))
    const candidateDistinguishing = candidateWords.filter((token) => productKindOf(token) === null)
    const candidateKinds = candidateWords.map(productKindOf).filter((kind): kind is number => kind !== null)

    const missingInCandidate = tetaDistinguishing.filter((token) =>
      !candidateWords.some((word) => sameWord(word, token)))
    const missingInTeta = candidateDistinguishing.filter((token) =>
      !tetaTokens.some((word) => sameWord(word, token)))

    // The share of the Teta name's distinguishing words the catalog name also states. Every one of
    // them has to be there: a word that only one of the two names states is a difference, and the
    // difference may be the variant ("Night" against "Day") or the flavour ("jablko" against
    // "hruška").
    const coverage = tetaDistinguishing.length === 0
      ? 1
      : (tetaDistinguishing.length - missingInCandidate.length) / tetaDistinguishing.length

    const candidateSizeLabel = sizeLabel(entry.candidate.productName)
    const sizeAgrees = tetaSizeLabel === null
      || candidateSizeLabel === null
      || tetaSizeLabel === candidateSizeLabel

    const reasons: string[] = []
    if (entry.packageAgreement === false) {
      // Both sides state a size and they are not the same size: two products.
      reasons.push('the package sizes differ')
    } else if (record.contradictory) {
      // The record's own numbers describe two different sizes, so it states no size that can be
      // trusted — the size cannot be compared at all, and the record is reported for review.
      reasons.push('the package size is contradictory')
    }
    // A size that only one side states is not a difference: what is missing cannot contradict
    // anything. Teta states no size for a fifth of its catalog, and the catalog names a size the
    // Teta page does not — the link is made when the names agree in every other respect, and the
    // product the link points at keeps the size the catalog knows.
    if (!brandAgrees) reasons.push('the brand is not in both names')
    if (coverage < TETA_IDENTITY_MIN_NAME_COVERAGE) {
      reasons.push(`the catalog name does not say ${missingInCandidate.map((word) => `'${word}'`).join(', ')}`)
    }
    if (missingInTeta.length > 0) {
      reasons.push(`the catalog name says ${missingInTeta.map((word) => `'${word}'`).join(', ')}`)
    }
    if (!sizeAgrees) reasons.push('the sizes differ')
    if (!productKindsCompatible(tetaKinds, candidateKinds)) {
      reasons.push('the names state different kinds of product')
    }
    if (evidence.conflictingVariantTokens.length > 0) reasons.push('variant token conflict')
    if (evidence.conflictingProductTypeTokens.length > 0) reasons.push('product-kind token conflict')
    if (evidence.conflictingPackagingTokens.length > 0) reasons.push('packaging token conflict')
    if (entry.modelAgreement === 'conflict') reasons.push('the model numbers differ')
    return {
      blockers: reasons,
      differences: { onlyTeta: missingInCandidate, onlyCandidate: missingInTeta },
    }
  }

  const evaluated = usable.map((entry) => ({ entry, blockers: assessCandidate(entry).blockers }))
  // The candidates that fit the Teta name in every respect. The ambiguity is between *these* — a
  // candidate that is a different product is not a second opinion, it is a wrong answer, and it
  // must not keep a correct link from being made.
  const agreeing = evaluated.filter(({ blockers }) => blockers.length === 0)
  const bestAgreeing = agreeing[0]

  if (bestAgreeing) {
    const runnerUp = agreeing[1]
    const gapOk = !runnerUp || bestAgreeing.entry.score - runnerUp.entry.score >= TETA_IDENTITY_RUNNER_UP_GAP
    if (gapOk) {
      return {
        externalId: record.externalId,
        name,
        status: 'auto',
        productId: bestAgreeing.entry.candidate.productId,
        productName: bestAgreeing.entry.candidate.productName,
        score: bestAgreeing.entry.score,
        reason: 'same brand, the same words, no conflict, and no second candidate',
        candidates: summary,
        ...(ownProduct ? { ownProduct } : {}),
      }
    }
    return {
      externalId: record.externalId,
      name,
      status: 'review',
      score: bestAgreeing.entry.score,
      reason: 'a second candidate is just as close',
      candidates: summary,
      refusedProduct: {
        productId: bestAgreeing.entry.candidate.productId,
        productName: bestAgreeing.entry.candidate.productName,
      },
      ...(ownProduct ? { ownProduct } : {}),
    }
  }

  return {
    externalId: record.externalId,
    name,
    status: 'review',
    score: best.score,
    reason: evaluated[0].blockers.join('; '),
    candidates: summary,
    refusedProduct: {
      productId: evaluated[0].entry.candidate.productId,
      productName: evaluated[0].entry.candidate.productName,
    },
    ...(ownProduct ? { ownProduct } : {}),
  }
}

/** The Teta products of a catalog run, in the shape the identity comparison needs. */
export function tetaIdentityRecords(records: TetaCatalogProduct[]): TetaIdentityRecord[] {
  return records.map((record) => ({
    externalId: record.externalId,
    name: record.name,
    ...(record.brand ? { brand: record.brand } : {}),
    ...(record.package ? { package: { quantity: record.package.quantity, unit: record.package.unit } } : {}),
    ...(record.warnings.includes(TETA_WARNING_UNIT_PRICE_DISAGREES) ? { contradictory: true } : {}),
  }))
}

/**
 * Gives every catalog product to at most one Teta SKU.
 *
 * Two Teta SKUs can both look like the same catalog product — the same line in two shades, the
 * same product in two sizes. Only one of them can be that product, and it is the one whose name
 * fits it best: the SKU that says "… 120" fits the catalog product "… 120 Vanilla" better than
 * the SKU that says "… 110". The other SKU keeps its own product and is reported for review.
 *
 * The decisions are changed in place. A decision that was "auto" and lost its catalog product
 * becomes a "review" with the reason, and no longer names a product.
 */
export function resolveTetaIdentityClaims(decisions: Iterable<TetaIdentityDecision>): void {
  // The decisions are read twice: first to find the winner of every product, then to demote the
  // ones that lost. An iterator (a map's values, for instance) is exhausted by the first read, so
  // the decisions are collected first.
  const all = [...decisions]
  const winners = new Map<string, { externalId: string; score: number }>()
  for (const decision of all) {
    if (decision.status !== 'auto' || !decision.productId) continue
    const score = decision.score ?? 0
    const current = winners.get(decision.productId)
    // A tie goes to the SKU that came first, so the result does not depend on the order the
    // candidates happened to be scored in.
    if (!current || score > current.score) {
      winners.set(decision.productId, { externalId: decision.externalId, score })
    }
  }
  for (const decision of all) {
    if (decision.status !== 'auto' || !decision.productId) continue
    const winner = winners.get(decision.productId)
    if (!winner || winner.externalId === decision.externalId) continue
    decision.status = 'review'
    decision.productId = undefined
    decision.productName = undefined
    decision.reason = 'another Teta product matches this catalog product better'
  }
}
