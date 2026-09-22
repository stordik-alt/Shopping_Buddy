import { generateObject } from 'ai'
import { z } from 'zod'
import { getVercelOidcToken } from '@vercel/oidc'
import type { ItemCategory, ItemUnit } from '@/lib/types'

/** One line item on a receipt as confirmed by the household — whether typed by hand or, for a
 *  real OCR import, accepted after automatic parsing (with or without manual correction). This is
 *  the shape `importReceiptAction` (app/actions/receipts.ts) actually turns into a purchase, so
 *  both entry paths converge here regardless of how the data was produced. */
export type ReceiptLineItem = {
  name: string
  category: ItemCategory
  quantity: number
  unit: ItemUnit
  price: number
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

/** Exchanges Vercel's short-lived OIDC token for a short-lived Google access token.
 *  This replaces service-account JSON keys, which are blocked by the project's Google
 *  organization policy (iam.disableServiceAccountKeyCreation).
 *
 *  Vercel's supported helper is used instead of reading the OIDC header/environment variable
 *  directly. It can refresh the token in development and reads the request-context token in
 *  Vercel Functions. Explicit project/team values keep local development independent of the
 *  current working directory's .vercel/project.json link. */
async function googleServiceAccountAccessToken(): Promise<{ token: string; projectId: string }> {
  const projectId = process.env.GCP_PROJECT_ID
  const projectNumber = process.env.GCP_PROJECT_NUMBER
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID
  const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL

  if (!projectId || !projectNumber || !poolId || !providerId || !serviceAccountEmail) {
    throw new Error(
      'GCP OIDC is not configured. Required: GCP_PROJECT_ID, GCP_PROJECT_NUMBER, ' +
        'GCP_WORKLOAD_IDENTITY_POOL_ID, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID, GCP_SERVICE_ACCOUNT_EMAIL',
    )
  }

  // Get a fresh Vercel OIDC token from the runtime instead of reading a raw token directly.
  const subjectToken = await getVercelOidcToken()

  if (!subjectToken) throw new Error('Vercel OIDC token is not available')

  const audience =
    `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`

  const stsResponse = await fetch('https://sts.googleapis.com/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      audience,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      subject_token: subjectToken,
    }),
  })

  const stsData = await stsResponse.json()
  if (!stsResponse.ok || !stsData.access_token) {
    throw new Error(
      'Google STS token exchange failed (' +
        stsResponse.status +
        '): ' +
        (stsData?.error_description ?? stsData?.error ?? 'unknown error'),
    )
  }

  const impersonationResponse = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:generateAccessToken`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + stsData.access_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scope: ['https://www.googleapis.com/auth/cloud-platform'],
        lifetime: '3600s',
      }),
    },
  )

  const impersonationData = await impersonationResponse.json()
  if (!impersonationResponse.ok || !impersonationData.accessToken) {
    throw new Error(
      'Google service-account impersonation failed (' +
        impersonationResponse.status +
        '): ' +
        (impersonationData?.error?.message ?? 'unknown error'),
    )
  }

  return { token: impersonationData.accessToken, projectId }
}

/** Google Cloud Vision PDF OCR using the online `files:annotate` endpoint. PDF input is sent
 * directly as base64. Google requires OAuth for this endpoint and allows at most five selected
 * pages per request, which is a deliberate receipt-import limit. */
export const googleVisionPdfTextExtractor: ReceiptTextExtractor = {
  async extractText(file) {
    const { token, projectId } = await googleServiceAccountAccessToken()
    const response = await fetch('https://vision.googleapis.com/v1/files:annotate', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'x-goog-user-project': projectId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          inputConfig: { content: file.base64, mimeType: 'application/pdf' },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          pages: [1, 2, 3, 4, 5],
        }],
      }),
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(
        'Google Vision PDF request failed (' +
          response.status +
          '): ' +
          (data?.error?.message ?? 'unknown error'),
      )
    }

    const responses = data.responses?.[0]?.responses ?? []
    const fullText = responses
      .map((item: { fullTextAnnotation?: { text?: string } }) => item.fullTextAnnotation?.text ?? '')
      .filter(Boolean)
      .join('\n')

    if (!fullText) throw new Error('Google Vision returned no readable text from the PDF')

    return {
      fullText,
      lines: fullText.split('\n').filter((line: string) => line.trim().length > 0),
    }
  },
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

Extract: the store name, the date (YYYY-MM-DD), the time (HH:MM) if present, the receipt number if present, the currency, every line item (name, quantity, unit, unit price, total price, discount), the subtotal, the total discount, and the grand total.

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
 *  authoritative on their own (section 8) — this checks the actual math and required fields. */
export function needsReview(receipt: ExtractedReceipt): boolean {
  if (!hasRequiredReceiptFields(receipt)) return true
  if (!isReceiptConsistent(receipt)) return true
  return receipt.items.some((item) => !isLineItemConsistent(item))
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
 *  resulting purchase. */
export function normalizeReceiptUnit(rawUnit: string | null): ItemUnit {
  if (!rawUnit) return 'ks'
  return UNIT_ALIASES[rawUnit.trim().toLowerCase()] ?? 'ks'
}

/** Turns a validated (or human-corrected) extraction into the `ReceiptLineItem[]` shape
 *  `importReceiptAction` already knows how to turn into a real purchase — the point where the OCR
 *  pipeline and the existing manual-entry path converge. Category defaults to 'Ostatní'; real
 *  catalog-product category resolution happens the same way it already does for every other entry
 *  path, via `matchProductByName` in the action layer, not duplicated here. Skips an item with no
 *  usable name — there's nothing to record. */
export function toReceiptLineItems(receipt: ExtractedReceipt): ReceiptLineItem[] {
  return receipt.items
    .filter((item) => item.name.trim().length > 0)
    .map((item) => {
      const quantity = item.quantity ?? 1
      // ReceiptLineItem.price is a *per-unit* price (receiptTotal/createPurchaseFromReceiptItems
      // multiply it by quantity) — the receipt's own totalPrice is the *line's* total, so it must
      // be divided back down to a unit price, not assigned directly (that would double-count
      // quantity > 1 once multiplied again downstream).
      const price = item.unitPrice ?? (item.totalPrice != null && quantity > 0 ? item.totalPrice / quantity : (item.totalPrice ?? 0))
      return {
        name: item.name.trim(),
        category: 'Ostatní' as ItemCategory,
        quantity,
        unit: normalizeReceiptUnit(item.unit),
        price,
        ...(item.confidence != null && { confidence: item.confidence }),
      }
    })
}

export function receiptTotal(items: ReceiptLineItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}
