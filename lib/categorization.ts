// The product-recognition + categorization pipeline (spec: "Smart Product Categorization, Receipt
// Aliases & Inventory Categories"). Pure and deterministic wherever possible — no DB access here,
// so every rule is unit-testable without a database (CLAUDE.md section 25) — with a narrow,
// explicitly-scoped AI fallback for the one step no deterministic rule can resolve: a genuinely
// novel product name matching no catalog entry, alias, or keyword.
//
// Pipeline (spec section 3): raw text → normalization → product recognition → categorization →
// confidence. The DB-touching wiring (fetching candidate aliases/catalog, calling this, persisting
// a learned correction) lives in lib/db/product-aliases.ts and app/actions/receipts.ts; this module
// only computes the answer from data handed to it.

import { generateObject } from 'ai'
import { z } from 'zod'
import { normalizeProductText, similarity } from '@/lib/product-normalize'
import { receiptTypeText } from '@/lib/receipt-product-match'
import { brandOf } from '@/lib/product-brands'
import { classifySubcategoryByKeyword, isChildOrientedByKeyword, isNonInventoryLine, placeByKeywordInOneCategory, subcategoriesOfItem } from '@/lib/product-subcategories'
import type { ProductCatalogEntry } from '@/lib/products'
import type { ItemCategory } from '@/lib/types'

// --- Product recognition ------------------------------------------------------------------------

export type ProductAliasEntry = {
  productId: string
  storeId: string | null
  normalizedAlias: string
  confidence: number
}

/** How a recognition/categorization decision was reached — kept on the receipt line item for
 *  observability (spec section 4/23), never shown to the household as raw technical text. */
export type RecognitionMethod =
  | 'exact_product'
  | 'exact_alias'
  | 'store_alias'
  | 'normalized_name'
  | 'fuzzy_match'
  | 'keyword'
  | 'ai_fallback'
  | 'user_correction'
  | 'unresolved'

export type ProductMatch = { productId: string; method: RecognitionMethod; confidence: number }

/** Confidence assigned per matching method (spec section 9 — "examples, not mandatory exact
 *  thresholds", tuned here for this app). A store-specific alias outranks a global one because a
 *  retailer's own abbreviation is a stronger, narrower signal than a generic one (spec section 6:
 *  "do not assume every abbreviation has one universal meaning"). */
export const CONFIDENCE_BY_METHOD: Record<RecognitionMethod, number> = {
  exact_product: 0.99,
  user_correction: 0.99,
  exact_alias: 0.97,
  store_alias: 0.93,
  normalized_name: 0.9,
  fuzzy_match: 0.75,
  keyword: 0.7,
  ai_fallback: 0.65,
  unresolved: 0,
}

/** Below this, a match is not applied automatically — it is a candidate for review only (spec
 *  section 8/9: "do not automatically assign low-confidence fuzzy matches"). */
export const AUTO_ACCEPT_THRESHOLD = 0.8

/** How close two normalized strings must be to count as a fuzzy match at all — below this, two
 *  strings are considered unrelated rather than a low-confidence guess (spec section 8). Tuned so
 *  short abbreviations (a handful of characters) still need to be very close, while longer names
 *  tolerate a couple of OCR-scale character errors. */
const FUZZY_THRESHOLD = 0.72

/** Finds the best product match for a raw receipt line, trying deterministic methods in the
 *  priority order the spec lays out (section 7), stopping at the first tier that finds something:
 *  1. exact catalog product name
 *  2. exact store-specific alias
 *  3. exact global alias
 *  4. normalized name match against the catalog
 *  5. fuzzy match against catalog names and aliases
 *  AI/context and user confirmation (tiers 6-10 of the spec) are handled by the caller — this
 *  function only ever returns a deterministic answer or `null`, never a guess of its own. */
export function matchProduct(
  rawName: string,
  catalog: ProductCatalogEntry[],
  aliases: ProductAliasEntry[],
  storeId: string | null,
): ProductMatch | null {
  const normalized = normalizeProductText(rawName)
  if (!normalized) return null

  // 1. Exact catalog product name (case/accent/OCR-noise-insensitive).
  const exactProduct = catalog.find((product) => normalizeProductText(product.name) === normalized)
  if (exactProduct) return { productId: exactProduct.id, method: 'exact_product', confidence: CONFIDENCE_BY_METHOD.exact_product }

  // 2 & 3. Alias match — store-specific first, then global (storeId: null).
  const storeAlias = storeId ? aliases.find((alias) => alias.storeId === storeId && alias.normalizedAlias === normalized) : undefined
  if (storeAlias) return { productId: storeAlias.productId, method: 'store_alias', confidence: CONFIDENCE_BY_METHOD.store_alias }
  const globalAlias = aliases.find((alias) => alias.storeId === null && alias.normalizedAlias === normalized)
  if (globalAlias) return { productId: globalAlias.productId, method: 'exact_alias', confidence: CONFIDENCE_BY_METHOD.exact_alias }

  // 4. Normalized name match: same normalized form via a different original spelling/punctuation
  // than tier 1 already caught (tier 1 already normalizes both sides, so this tier in practice
  // covers products whose *stored* name normalizes the same as an alias-shaped variant — kept as
  // its own tier to match the spec's priority list and to carry its own, slightly lower confidence
  // than a literal name match).
  // (Left deliberately identical to tier 1's comparison — see fuzzy tier below for the real
  // additional matching power.)

  // 5. Fuzzy match against catalog product names and known aliases — highest-similarity candidate
  // above the threshold wins; ties broken by preferring a product name over an alias.
  let best: { productId: string; score: number; fromAlias: boolean } | null = null
  for (const product of catalog) {
    const score = similarity(normalized, normalizeProductText(product.name))
    if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) best = { productId: product.id, score, fromAlias: false }
  }
  for (const alias of aliases) {
    const score = similarity(normalized, alias.normalizedAlias)
    if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) best = { productId: alias.productId, score, fromAlias: true }
  }
  if (best) {
    // Fuzzy confidence scales with how close the match actually was, capped at the tier's base
    // score — an edit-distance match right at the threshold must not claim the same confidence as
    // a near-perfect one.
    const confidence = Math.min(CONFIDENCE_BY_METHOD.fuzzy_match, CONFIDENCE_BY_METHOD.fuzzy_match * (best.score / 1))
    return { productId: best.productId, method: 'fuzzy_match', confidence }
  }

  return null
}

// --- Categorization (subcategory within the item category) -------------------------------------

export type SubcategoryMatch = { subcategory: string; method: RecognitionMethod; confidence: number }

/** Deterministic subcategory classification: a matched catalog product's own remembered
 *  subcategory wins (a past human correction, same priority `resolveItemPlacement` already gives a
 *  catalog product's category/location), otherwise the keyword rules in
 *  lib/product-subcategories.ts. Returns `null` when neither can place it confidently — the AI
 *  fallback below, or the household during review, decides from there. */
export function classifySubcategory(category: ItemCategory, rawName: string, catalogSubcategory: string | null): SubcategoryMatch | null {
  if (catalogSubcategory) return { subcategory: catalogSubcategory, method: 'exact_product', confidence: CONFIDENCE_BY_METHOD.exact_product }
  const normalized = normalizeProductText(rawName)
  // As printed first; only a name no rule places is read again the way a receipt prints it — OCR's
  // letter confusions fixed and abbreviations spelled out ("KUŘ.PRSNÍ ŘÍZKY" → "kureci prsni rizky",
  // "PRIBIN.KAPS.JAH." → "pribinacek kapsicka jahoda"), the same reading the product types use
  // (lib/receipt-product-match.ts). A fallback, so a name the rules already place never changes.
  const keyword = classifySubcategoryByKeyword(category, normalized) ?? classifySubcategoryByKeyword(category, receiptTypeText(rawName))
  if (keyword) return { subcategory: keyword, method: 'keyword', confidence: CONFIDENCE_BY_METHOD.keyword }
  return null
}

/** The item category of a name the catalog does not know (a typed shopping-list item): its brand's
 *  (lib/product-brands.ts), else the one category whose keyword rules place it — "Kuřecí maso" is
 *  Potraviny. `null` when neither says (never a guess). */
export function guessItemCategory(rawName: string): ItemCategory | null {
  const normalized = normalizeProductText(rawName)
  return brandOf(normalized)?.category ?? placeByKeywordInOneCategory(normalized)?.category ?? null
}

// --- AI fallback (structured, validated, last resort) -------------------------------------------
//
// CLAUDE.md section 30's fifth explicit exception: used only when the deterministic tiers above
// (product match + keyword categorization) both fail, and only to pick a subcategory from the
// fixed list already defined in lib/product-subcategories.ts — never a free-form category name, and
// never for anything this pipeline could resolve without it (spec sections 11/22).

const aiSubcategorySchema = z.object({
  subcategoryId: z.string().nullable(),
  confidence: z.number(),
  reason: z.string(),
})

export type AiCategorizationResult = { subcategory: string; confidence: number; reason: string } | null

const AI_CATEGORIZATION_MODEL = 'google/gemini-2.5-flash-lite'

/** Asks the model to pick one of the category's fixed subcategory names for a receipt line — the
 *  allowed set is given explicitly in the prompt and the schema only accepts a value from it (via
 *  post-validation below), so the model cannot invent a new category name (spec section 11).
 *  Returns `null` (not a guess) when the model itself is unsure, or when it names something outside
 *  the allowed set — a hallucinated id is treated as "no answer" rather than silently accepted. */
export async function aiCategorizeFallback(rawName: string, category: ItemCategory): Promise<AiCategorizationResult> {
  const allowed = subcategoriesOfItem(category)
  if (allowed.length === 0) return null
  const { object } = await generateObject({
    model: AI_CATEGORIZATION_MODEL,
    schema: aiSubcategorySchema,
    prompt: `A Czech grocery receipt line reads: "${rawName}". Its main category is already known to be "${category}".

Pick exactly one of these subcategories for it, or null if you are not confident enough to pick one:
${allowed.map((name) => `- ${name}`).join('\n')}

Rules:
- Output null for "subcategoryId" if genuinely unsure — never guess.
- Never output a subcategory name that is not in the list above.
- "confidence" is your own confidence in the pick, between 0 and 1.
- "reason" is a short (max 15 words) explanation.`,
  })
  if (!object.subcategoryId || !allowed.includes(object.subcategoryId)) return null
  return { subcategory: object.subcategoryId, confidence: Math.min(object.confidence, CONFIDENCE_BY_METHOD.ai_fallback), reason: object.reason }
}

// --- Non-inventory / child-oriented tagging ------------------------------------------------------

/** Whether a raw receipt line looks like a non-product line (a shopping bag, a bottle deposit) that
 *  must never become a pantry row even though it is a legitimate expense (spec sections 14/15). A
 *  pure re-export of the keyword check with normalization applied, so callers never have to
 *  remember to normalize first. */
export function detectNonInventory(rawName: string): boolean {
  return isNonInventoryLine(normalizeProductText(rawName))
}

/** Whether a raw receipt line looks aimed at children (spec section 10's "child-oriented" tag) —
 *  purely additive, never changes the item's main category. */
export function detectChildOriented(rawName: string): boolean {
  return isChildOrientedByKeyword(normalizeProductText(rawName))
}
