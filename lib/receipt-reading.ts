import { generateObject } from 'ai'
import { z } from 'zod'
import { RECEIPT_READING_PROMPT, RECEIPT_READING_PROMPT_VERSION } from '@/lib/receipt-reading-prompt'
import type { ExtractedReceipt } from '@/lib/receipts'
import type { ItemCategory } from '@/lib/types'

// Reading a receipt in one step: the photo(s) go straight to GPT-6 Luna, which returns the receipt in
// the app's own structure (docs/18_RECEIPT_READER_LUNA.md). The model only reads the document; what
// it returns is turned into the existing `ExtractedReceipt` (`toExtractedReceipt`), so the app's own
// validation, normalization, product matching, categorization, duplicate check and purchase creation
// (lib/receipts.ts, lib/receipt-import.ts) stay the authority over the data. Owner-approved exception
// to CLAUDE.md section 30, covering this receipt-reading call only.

const ITEM_CATEGORIES = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní'] as const satisfies readonly ItemCategory[]

// Strict structured output: every key is always present; "not printed / not sure" is null, never a
// missing key. No min/max constraints in the schema (not every provider's strict mode accepts them) —
// ranges are enforced in code instead (`clampConfidence`, lib/receipts.ts hasInvalidAmounts).
export const receiptReadingItemSchema = z.object({
  rawName: z.string(),
  normalizedName: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  packageSize: z.number().nullable(),
  packageUnit: z.string().nullable(),
  unitPrice: z.number().nullable(),
  lineTotal: z.number().nullable(),
  discount: z.number().nullable(),
  categoryHint: z.enum(ITEM_CATEGORIES).nullable(),
  ean: z.string().nullable(),
  confidence: z.number(),
  imageIndex: z.number().int(),
})

export const receiptReadingSchema = z.object({
  receipt: z.object({
    merchant: z.string().nullable(),
    storeAddress: z.string().nullable(),
    storeCity: z.string().nullable(),
    date: z.string().nullable(),
    time: z.string().nullable(),
    receiptNumber: z.string().nullable(),
    currency: z.string().nullable(),
    subtotal: z.number().nullable(),
    discountTotal: z.number().nullable(),
    total: z.number().nullable(),
    confidence: z.number(),
  }),
  items: z.array(receiptReadingItemSchema),
  images: z.array(z.object({ index: z.number().int(), readable: z.boolean(), note: z.string().nullable() })),
})

export type ReceiptReading = z.infer<typeof receiptReadingSchema>
export type ReceiptReadingItem = z.infer<typeof receiptReadingItemSchema>

/** A confidence as a number in 0–1; anything else (NaN, out of range) counts as no confidence. */
export function clampConfidence(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}

/** The reading in the shape the existing pipeline validates and imports. The printed text stays the
 *  item's name — product matching and learned aliases work on it; `normalizedName` is only a hint for
 *  people, and `categoryHint` only a hint the app's own categorization may use (lib/categorization.ts
 *  decides). A date that is not a real YYYY-MM-DD becomes null, which sends the receipt to review. */
export function toExtractedReceipt(reading: ReceiptReading): ExtractedReceipt {
  const { receipt } = reading
  return {
    store: { name: receipt.merchant, address: receipt.storeAddress, city: receipt.storeCity, confidence: clampConfidence(receipt.confidence) },
    date: isIsoDate(receipt.date) ? receipt.date : null,
    time: receipt.time,
    receiptNumber: receipt.receiptNumber,
    currency: receipt.currency,
    items: reading.items.map((item) => ({
      name: item.rawName,
      category: item.categoryHint,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      totalPrice: item.lineTotal,
      discount: item.discount,
      confidence: clampConfidence(item.confidence),
    })),
    subtotal: receipt.subtotal,
    discountTotal: receipt.discountTotal,
    total: receipt.total,
    confidence: clampConfidence(receipt.confidence),
  }
}

function isIsoDate(value: string | null): value is string {
  if (value == null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

// --- Decision (docs/18 section "Decision") ----------------------------------------------------------

/** At or above this confidence (receipt and every item) a receipt that passes every check imports on
 *  its own. Below `RETAKE_BELOW` the receipt as a whole is not trusted enough to review — a new photo is
 *  asked for. Starting values; tuned on the measured dataset (scripts/receipt-eval). */
export const AUTO_IMPORT_CONFIDENCE = 0.9
export const RETAKE_BELOW = 0.7

export type ReceiptDecision = {
  decision: 'auto' | 'review' | 'retake'
  /** Items (by index) whose confidence is below `RETAKE_BELOW`, to be pointed out in the review form. */
  doubtfulItems: number[]
}

/** What happens with a reading. `checksPassed` is the app's own verdict — totals add up, required fields
 *  are present, units and storage places are known (lib/receipts.ts needsReview and the placement gate
 *  in lib/receipt-import.ts). Confidence can only make the outcome stricter, never let a receipt that
 *  failed a check through (docs/08 section 8). */
export function receiptDecision(reading: ReceiptReading, { checksPassed }: { checksPassed: boolean }): ReceiptDecision {
  const doubtfulItems = reading.items.flatMap((item, index) => (clampConfidence(item.confidence) < RETAKE_BELOW ? [index] : []))
  const receiptConfidence = clampConfidence(reading.receipt.confidence)
  if (reading.images.some((image) => !image.readable) || receiptConfidence < RETAKE_BELOW) return { decision: 'retake', doubtfulItems }
  const confident = receiptConfidence >= AUTO_IMPORT_CONFIDENCE && reading.items.every((item) => clampConfidence(item.confidence) >= AUTO_IMPORT_CONFIDENCE)
  return { decision: checksPassed && confident && reading.items.length > 0 ? 'auto' : 'review', doubtfulItems }
}

// --- Reader -------------------------------------------------------------------------------------------

export const RECEIPT_READING_MODEL = 'openai/gpt-6-luna'

export type ReceiptReadingInput = { images: { base64: string; mimeType: string }[] } | { text: string }

export type ReceiptReadingUsage = { inputTokens?: number; outputTokens?: number }

export interface ReceiptImageReader {
  /** Identifies the model and prompt in logs and measurements. */
  readonly id: string
  read(input: ReceiptReadingInput, options?: { onUsage?: (usage: ReceiptReadingUsage) => void }): Promise<ReceiptReading>
}

type GenerateObject = typeof generateObject

/** The model call's message: the instructions, then every photo in order (or the receipt's text layer). */
export function receiptReadingMessage(input: ReceiptReadingInput) {
  if ('text' in input) {
    return { role: 'user' as const, content: [{ type: 'text' as const, text: `${RECEIPT_READING_PROMPT}\n\nText layer of the receipt:\n${input.text}` }] }
  }
  if (input.images.length === 0) throw new Error('No receipt photo to read')
  return {
    role: 'user' as const,
    content: [
      { type: 'text' as const, text: `${RECEIPT_READING_PROMPT}\n\nThe receipt has ${input.images.length} photo(s), in order:` },
      ...input.images.map((image) => ({ type: 'file' as const, data: Buffer.from(image.base64, 'base64'), mediaType: image.mimeType })),
    ],
  }
}

/** GPT-6 Luna through the AI Gateway (a plain "provider/model" string, as for the other model calls).
 *  `reasoningEffort` is chosen by measurement; `generate` is injectable for tests. A response that does
 *  not fit the schema throws, so the import fails with a reason instead of storing partial data. */
export function createLunaReceiptReader({
  model = RECEIPT_READING_MODEL,
  reasoningEffort = 'low',
  generate = generateObject,
}: { model?: string; reasoningEffort?: 'none' | 'low' | 'medium'; generate?: GenerateObject } = {}): ReceiptImageReader {
  return {
    id: `${model}:${reasoningEffort}:${RECEIPT_READING_PROMPT_VERSION}`,
    async read(input, options) {
      const { object, usage } = await generate({
        model,
        schema: receiptReadingSchema,
        providerOptions: { openai: { reasoningEffort } },
        messages: [receiptReadingMessage(input)],
      })
      options?.onUsage?.({ inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens })
      return object
    },
  }
}
