import { generateObject } from 'ai'
import { z } from 'zod'
import { inferPantryLocation } from '@/lib/pantry'
import { matchProductByName, type ProductCatalogEntry } from '@/lib/products'
import type { ItemCategory, ItemUnit, PantryLocation } from '@/lib/types'

const ITEM_CATEGORIES = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní'] as const satisfies readonly ItemCategory[]

/** One line item on a receipt as confirmed by the household — whether typed by hand or, for a
 *  real OCR import, accepted after automatic parsing (with or without manual correction). This is
 *  the shape `importReceiptAction` (app/actions/receipts.ts) actually turns into a purchase, so
 *  both entry paths converge here regardless of how the data was produced. `location` is the
 *  pantry placement the household confirmed (or the pipeline resolved confidently) — optional
 *  because a genuinely ambiguous item reaches the review form with it unset, forcing the
 *  household to pick rather than defaulting it (docs/08_OCR_RECEIPT_PIPELINE.md's "NEHÁDEJ" rule
 *  extended to storage location, not just OCR values). */
export type ReceiptLineItem = {
  name: string
  category: ItemCategory
  quantity: number
  unit: ItemUnit
  price: number
  location?: PantryLocation
  confidence?: number
}

// --- OCR pipeline (docs/08_OCR_RECEIPT_PIPELINE.md) -------------------------------------------
//
// Deliberately two separate stages, not one call, per the owner's explicit cost-reduction
// rationale: OCR (Google Cloud Vision) is cheap and mechanical; only the *structuring* step needs
// an LLM, and using the cheapest capable model there (Gemini Flash-Lite) keeps that the only part
// of the pipeline with real per-call model cost. Conflating them into one call would either force
// every OCR request through an LLM, or force the OCR step to also do the LLM's job.

/** Raw text extraction result from an OCR provider (stage 1). */
export type OcrResult = { fullText: string; lines: string[] }

/** Stage 1: image → raw text. The seam a real OCR provider plugs into — Google Cloud Vision by
 *  default (see `googleVisionTextExtractor`), but the pipeline doesn't care which provider
 *  produces `OcrResult` as long as it's real OCR output, not a guess. */
export interface ReceiptTextExtractor {
  extractText(image: { base64: string; mimeType: string }): Promise<OcrResult>
}

/** The parser's structured output — mirrors docs/08_OCR_RECEIPT_PIPELINE.md section 6's target
 *  JSON shape. Every field the model isn't unambiguously sure of must be `null`, never a guess
 *  (section 5/21) — confidence scores exist to flag *which* fields to distrust, not to replace
 *  validation (section 8). `unit`/`quantity`/`unitPrice` are kept as the model's raw best-effort
 *  reading, not yet normalized to the app's `ItemUnit`/`ItemCategory` — that happens in
 *  `toReceiptLineItems()` below, after validation has had a chance to flag the receipt for review. */
export const extractedReceiptItemSchema = z.object({
  name: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  unitPrice: z.number().nullable(),
  totalPrice: z.number().nullable(),
  discount: z.number().nullable(),
  // The item's category, from the app's fixed set — null when the model isn't confident enough to
  // pick one (never a guess). Missing/null routes the item to review via `resolveItemPlacement()`
  // below, same "null over a guess" rule as every other field here.
  category: z.enum(ITEM_CATEGORIES).nullable(),
  confidence: z.number().nullable(),
})

export const extractedReceiptSchema = z.object({
  store: z.object({ name: z.string().nullable(), confidence: z.number().nullable() }),
  date: z.string().nullable(),
  time: z.string().nullable(),
  receiptNumber: z.string().nullable(),
  currency: z.string().nullable(),
  items: z.array(extractedReceiptItemSchema),
  subtotal: z.number().nullable(),
  discountTotal: z.number().nullable(),
  total: z.number().nullable(),
  confidence: z.number().nullable(),
})

export type ExtractedReceiptItem = z.infer<typeof extractedReceiptItemSchema>
export type ExtractedReceipt = z.infer<typeof extractedReceiptSchema>

/** Stage 2: normalized OCR text → structured data. The seam a real structuring model plugs into —
 *  Gemini Flash-Lite via the Vercel AI Gateway by default (see `geminiStructuringProvider`). */
export interface ReceiptStructuringProvider {
  structure(normalizedText: string): Promise<ExtractedReceipt>
}

/** Google Cloud Vision's `DOCUMENT_TEXT_DETECTION` via the plain REST API (no Google Cloud client
 *  library needed for this one call) — per docs/08_OCR_RECEIPT_PIPELINE.md section 3. Requires
 *  `GOOGLE_VISION_API_KEY`, restricted to the Cloud Vision API only (never sent to the client;
 *  CLAUDE.md section 39). Throws with a message the caller can store as the import's
 *  `errorMessage` and surface for `Retry` (section 13) — never returns a fabricated result. */
export const googleVisionTextExtractor: ReceiptTextExtractor = {
  async extractText(image) {
    const apiKey = process.env.GOOGLE_VISION_API_KEY
    if (!apiKey) throw new Error('GOOGLE_VISION_API_KEY is not configured')

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image: { content: image.base64 }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }],
      }),
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(`Google Vision request failed (${response.status}): ${data?.error?.message ?? 'unknown error'}`)
    }
    const result = data.responses?.[0]
    if (result?.error) throw new Error(`Google Vision error: ${result.error.message}`)
    const fullText: string = result?.fullTextAnnotation?.text ?? ''
    if (!fullText) throw new Error('Google Vision returned no readable text')
    const lines = fullText.split('\n').filter((line: string) => line.trim().length > 0)
    return { fullText, lines }
  },
}

/** The cheapest Gemini Flash-Lite variant available on the Gateway as of 2026-09-22 — re-check
 *  `https://ai-gateway.vercel.sh/v1/models` before assuming this is still current; AI Gateway
 *  model IDs/pricing change over time. A plain `provider/model` string routes through the Gateway
 *  directly (no `@ai-sdk/google` dependency needed) — auth is Vercel OIDC for a linked local
 *  project or a Vercel deployment, per CLAUDE.md section 31's cost-control mandate to use the
 *  cheapest model that does the job. */
const STRUCTURING_MODEL = 'google/gemini-2.5-flash-lite'

/** Structures normalized OCR text into `ExtractedReceipt` via the cheap model above. The prompt
 *  encodes docs/08_OCR_RECEIPT_PIPELINE.md's most important rule (section 21): a `null` is always
 *  correct when uncertain, a guessed value is never acceptable. `generateObject`'s schema
 *  validation means a response that doesn't fit the shape throws rather than returning
 *  partial/malformed data. */
export const geminiStructuringProvider: ReceiptStructuringProvider = {
  async structure(normalizedText) {
    const { object } = await generateObject({
      model: STRUCTURING_MODEL,
      schema: extractedReceiptSchema,
      prompt: `You are extracting structured data from the OCR text of a Czech retail receipt.

Extract: the store name, the date (YYYY-MM-DD), the time (HH:MM) if present, the receipt number if present, the currency, every line item (name, quantity, unit, unit price, total price, discount, category), the subtotal, the total discount, and the grand total.

Each item's category must be exactly one of: "Potraviny" (food), "Drogerie" (drugstore/hygiene/cleaning), "Děti" (children's/baby products), "Domácnost" (other household goods), "Ostatní" (anything else, or genuinely unclear). If you are not confident which of these five fits, output null — never guess.

Rules — follow these exactly:
- Never invent or estimate a value. If a value is not unambiguously present in the text, output null for it.
- Do not "correct" a product name into a different, more common product based on a guess (e.g. do not change a real product name just because it looks like an OCR error for something else).
- Every numeric value must come directly from the text — never calculated, rounded, or assumed.
- Give each item and the overall extraction a confidence score between 0 and 1, reflecting how certain you are the OCR text actually supports that reading.

OCR text:
${normalizedText}`,
    })
    return object
  },
}

// --- OCR text normalization (docs/08_OCR_RECEIPT_PIPELINE.md section 4) ------------------------

/** Strips redundant whitespace and normalizes line endings ahead of the AI parser, while
 *  preserving line order and every line's actual content — deliberately does *not* attempt to
 *  "fix" OCR artifacts in product names (e.g. `MLÉK0` → `MLÉKO`), since that requires a judgment
 *  call this function has no business making; the AI parser (and, failing that, human review) is
 *  where that kind of correction belongs, not a blind text-normalization step. */
export function normalizeOcrText(rawText: string): string {
  return rawText
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

// --- Validation (docs/08_OCR_RECEIPT_PIPELINE.md section 7) ------------------------------------

/** Rounding tolerance for currency comparisons, in currency units — absorbs OCR/float noise
 *  without letting a genuinely wrong total slip through as "consistent". */
const CONSISTENCY_TOLERANCE = 0.5

/** Whether a single line item's quantity × unit price matches its stated total price. Returns
 *  true (not "inconsistent") when there isn't enough data to check — this function flags
 *  contradictions, it doesn't penalize incompleteness (`hasRequiredFields`/`needsReview` below
 *  handle missing data separately). */
export function isLineItemConsistent(item: ExtractedReceiptItem): boolean {
  if (item.quantity == null || item.unitPrice == null || item.totalPrice == null) return true
  return Math.abs(item.quantity * item.unitPrice - item.totalPrice) <= CONSISTENCY_TOLERANCE
}

/** Whether the sum of line items minus discounts matches the receipt's stated total. */
export function isReceiptConsistent(receipt: ExtractedReceipt): boolean {
  if (receipt.total == null) return false
  const itemsTotal = receipt.items.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0)
  const discount = receipt.discountTotal ?? 0
  return Math.abs(itemsTotal - discount - receipt.total) <= CONSISTENCY_TOLERANCE
}

/** The store, date, and total are the fields whose absence makes a receipt unusable — everything
 *  else (e.g. receipt number) is optional and must not by itself force a review. */
export function hasRequiredReceiptFields(receipt: ExtractedReceipt): boolean {
  return receipt.store.name != null && receipt.date != null && receipt.total != null
}

/** The single gate deciding `parsed → validating → completed` vs `review_required`
 *  (docs/08_OCR_RECEIPT_PIPELINE.md section 7/11). Confidence scores are informative but never
 *  authoritative on their own (section 8) — this checks the actual math and required fields, plus
 *  (below) whether every item's unit could actually be recognized — an unrecognized unit (e.g.
 *  "furlongs") must not silently become "ks", it must stop the automatic pass. Catalog/storage-
 *  location ambiguity is a separate, catalog-aware gate — see `resolveItemPlacement()` below, run
 *  by `app/actions/receipts.ts`'s `processReceiptImport()` since it needs DB access this pure
 *  function doesn't have. */
export function needsReview(receipt: ExtractedReceipt): boolean {
  if (!hasRequiredReceiptFields(receipt)) return true
  if (!isReceiptConsistent(receipt)) return true
  if (receipt.items.some((item) => !isLineItemConsistent(item))) return true
  return receipt.items.some((item) => item.name.trim().length > 0 && !isRecognizedUnit(item.unit))
}

// --- Duplicate detection (docs/08_OCR_RECEIPT_PIPELINE.md section 9) ---------------------------

export type ReceiptFingerprint = { storeLocationId: string | null; date: string; total: number; receiptNumber: string | null }

/** Whether two receipts look like the same real-world purchase. A shared receipt number pins the
 *  match to the same date; without one, falls back to same store/date/total within a small
 *  rounding tolerance. Never auto-resolves anything — the caller (app/actions/receipts.ts) is
 *  responsible for routing a match to `duplicate_review` rather than silently deduplicating. */
export function isPotentialDuplicate(existing: ReceiptFingerprint, incoming: ReceiptFingerprint): boolean {
  if (existing.receiptNumber && incoming.receiptNumber) {
    return existing.receiptNumber === incoming.receiptNumber && existing.date === incoming.date
  }
  return existing.date === incoming.date && existing.storeLocationId === incoming.storeLocationId && Math.abs(existing.total - incoming.total) <= CONSISTENCY_TOLERANCE
}

// --- Converting a validated extraction into what importReceiptAction expects --------------------

const UNIT_ALIASES: Record<string, ItemUnit> = {
  ks: 'ks',
  kus: 'ks',
  kusy: 'ks',
  bal: 'ks',
  balení: 'ks',
  kg: 'kg',
  g: 'g',
  gram: 'g',
  gramy: 'g',
  l: 'l',
  litr: 'l',
  ml: 'ml',
}

/** Maps a receipt's raw, inconsistently-written unit text onto the app's fixed `ItemUnit` set —
 *  case-insensitive, no fuzzy matching (same no-guessing philosophy as `lib/products.ts`'s
 *  `matchProductByName`). Falls back to 'ks' for anything unrecognized rather than rejecting the
 *  whole item over a unit the app doesn't model — quantity/price are what actually matter for the
 *  resulting purchase, and `needsReview()` (via `isRecognizedUnit()` below) is what actually stops
 *  an unrecognized unit from being auto-completed; this function only decides what to *show* the
 *  household while they're reviewing/correcting it, never a value that silently ships unreviewed. */
export function normalizeReceiptUnit(rawUnit: string | null): ItemUnit {
  if (!rawUnit) return 'ks'
  return UNIT_ALIASES[rawUnit.trim().toLowerCase()] ?? 'ks'
}

/** Whether a receipt's raw unit text is one `normalizeReceiptUnit()` actually recognizes — missing
 *  is fine (defaults to "ks", the overwhelmingly common case for a receipt with no unit printed at
 *  all), but present-and-unrecognized (e.g. "furlongs") is not: that must stop the automatic pass
 *  via `needsReview()` rather than silently becoming "ks". */
export function isRecognizedUnit(rawUnit: string | null): boolean {
  if (rawUnit == null || rawUnit.trim() === '') return true
  return UNIT_ALIASES[rawUnit.trim().toLowerCase()] != null
}

/** Resolves where a receipt item belongs (category + pantry location) with the same catalog-first
 *  priority as the rest of the app's product handling — or `null` when neither the catalog nor a
 *  confident deterministic guess can place it, meaning the caller must route the receipt to manual
 *  review rather than guess (docs/08_OCR_RECEIPT_PIPELINE.md's "NEHÁDEJ" rule, extended by the
 *  product owner from OCR values to category/storage-location too). Priority:
 *  1. An existing catalog product's own remembered category/location always wins — even over what
 *     the AI/OCR guessed for this particular receipt — because a past human correction
 *     (`lib/db/queries.ts`'s `upsertProductCatalogDefaults()`) is more trustworthy than a fresh
 *     per-receipt guess. A catalog product with no remembered location yet (never corrected) still
 *     falls through to the deterministic keyword classification below, using the catalog's own
 *     category (not the AI's).
 *  2. No catalog match: the AI-provided category, if any, classified deterministically via
 *     `lib/pantry.ts`'s `inferPantryLocation()` (itself `null` when the category/name genuinely
 *     doesn't match a known keyword — see that function's own doc comment).
 *  3. No catalog match and no AI category either: unplaceable, `null`. */
export function resolveItemPlacement(
  catalogEntry: Pick<ProductCatalogEntry, 'category' | 'defaultLocation'> | null,
  aiCategory: ItemCategory | null,
  name: string,
): { category: ItemCategory; location: PantryLocation } | null {
  if (catalogEntry) {
    const location = catalogEntry.defaultLocation ?? inferPantryLocation(catalogEntry.category, name)
    if (location == null) return null
    return { category: catalogEntry.category, location }
  }
  if (!aiCategory) return null
  const location = inferPantryLocation(aiCategory, name)
  if (location == null) return null
  return { category: aiCategory, location }
}

/** Turns a validated (or human-corrected) extraction into the `ReceiptLineItem[]` shape
 *  `importReceiptAction` already knows how to turn into a real purchase — the point where the OCR
 *  pipeline and the existing manual-entry path converge. `catalog`, when supplied, lets this
 *  pre-fill each item's real category/location via `resolveItemPlacement()` above (used when
 *  building the review form's pre-filled values); omitted, every item falls back to the OCR/AI's
 *  own category (or 'Ostatní' if it couldn't classify) and no location, matching the previous
 *  behavior for callers that don't have catalog access. Skips an item with no usable name — there's
 *  nothing to record. */
export function toReceiptLineItems(receipt: ExtractedReceipt, catalog: ProductCatalogEntry[] = []): ReceiptLineItem[] {
  return receipt.items
    .filter((item) => item.name.trim().length > 0)
    .map((item) => {
      const quantity = item.quantity ?? 1
      // ReceiptLineItem.price is a *per-unit* price (receiptTotal/createPurchaseFromReceiptItems
      // multiply it by quantity) — the receipt's own totalPrice is the *line's* total, so it must
      // be divided back down to a unit price, not assigned directly (that would double-count
      // quantity > 1 once multiplied again downstream).
      const price = item.unitPrice ?? (item.totalPrice != null && quantity > 0 ? item.totalPrice / quantity : (item.totalPrice ?? 0))
      const catalogEntry = matchProductByName(catalog, item.name)
      const placement = resolveItemPlacement(catalogEntry, item.category, item.name)
      return {
        name: item.name.trim(),
        category: placement?.category ?? item.category ?? ('Ostatní' as ItemCategory),
        quantity,
        unit: normalizeReceiptUnit(item.unit),
        price,
        ...(placement != null && { location: placement.location }),
        ...(item.confidence != null && { confidence: item.confidence }),
      }
    })
}

export function receiptTotal(items: ReceiptLineItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}
