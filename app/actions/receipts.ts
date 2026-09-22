'use server'

import { del, get, put } from '@vercel/blob'
import { and, eq, gte } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { TODAY } from '@/lib/budget'
import { getDb } from '@/lib/db/client'
import { getProductCatalog, restockPantryItem, toReceiptImportState, type ReceiptImportState } from '@/lib/db/queries'
import * as schema from '@/lib/db/schema'
import { matchProductByName } from '@/lib/products'
import {
  geminiStructuringProvider,
  googleVisionTextExtractor,
  isPotentialDuplicate,
  needsReview,
  normalizeOcrText,
  receiptTotal,
  toReceiptLineItems,
  type ExtractedReceipt,
  type ReceiptLineItem,
  type ReceiptStructuringProvider,
  type ReceiptTextExtractor,
} from '@/lib/receipts'
import type { PurchaseRecord } from '@/lib/types'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])

async function assertOwnsReceiptImport(householdId: string, receiptImportId: string) {
  const db = getDb()
  const row = await db.query.receiptImports.findFirst({ where: eq(schema.receiptImports.id, receiptImportId) })
  if (!row || row.householdId !== householdId) throw new Error('Receipt import not found')
  return row
}

/** The one place a `ReceiptLineItem[]` actually becomes a real purchase — shared by manual entry
 *  (`importReceiptAction`), a fully-automatic OCR pass, and a human-reviewed/corrected OCR result,
 *  so the purchase-creation/pantry-restocking rule lives in exactly one place per CLAUDE.md
 *  section 6. Does not touch `receipt_imports` — callers own that record's lifecycle. */
async function createPurchaseFromReceiptItems(
  householdId: string,
  items: ReceiptLineItem[],
  options: { date?: string; storeLocationId?: string | null },
): Promise<PurchaseRecord> {
  if (items.length === 0) throw new Error('Receipt has no items')
  const db = getDb()
  const date = options.date ?? TODAY

  const catalog = await getProductCatalog()
  const resolvedItems = items.map((item) => ({ ...item, productId: matchProductByName(catalog, item.name)?.id ?? null }))

  const total = receiptTotal(resolvedItems)
  const [purchaseRow] = await db
    .insert(schema.purchases)
    .values({ householdId, storeLocationId: options.storeLocationId, date, total: total.toString() })
    .returning()

  const itemRows = await db
    .insert(schema.purchaseItems)
    .values(
      resolvedItems.map((item) => ({
        purchaseId: purchaseRow.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        price: item.price.toString(),
      })),
    )
    .returning()

  for (const item of resolvedItems) {
    await restockPantryItem(householdId, { productId: item.productId, name: item.name, category: item.category, quantity: item.quantity, unit: item.unit })
  }

  const storeLocation = options.storeLocationId
    ? await db.query.storeLocations.findFirst({ where: eq(schema.storeLocations.id, options.storeLocationId), with: { store: true } })
    : null

  return {
    id: purchaseRow.id,
    date: purchaseRow.date,
    store: storeLocation?.store.chain,
    total: Number(purchaseRow.total),
    items: itemRows.map((row) => ({ name: row.name, quantity: row.quantity, unit: row.unit, price: Number(row.price) })),
  }
}

/** Turns a manually-entered receipt into a real purchase, and keeps a `receipt_imports` record so
 *  a future OCR provider's output stays auditable/reprocessable, extending CLAUDE.md section 16's
 *  price/deal provenance rule to purchases too. Every manual import goes straight to `imported` —
 *  there's no OCR/AI step to fail or need review. */
export async function importReceiptAction(
  items: ReceiptLineItem[],
  options: { date?: string; storeLocationId?: string } = {},
): Promise<{ purchase: PurchaseRecord }> {
  const householdId = await requireHouseholdId()
  const purchase = await createPurchaseFromReceiptItems(householdId, items, options)

  const db = getDb()
  await db.insert(schema.receiptImports).values({
    householdId,
    status: 'imported',
    storeLocationId: options.storeLocationId,
    date: options.date ?? TODAY,
    source: 'manual',
    items: JSON.stringify(items),
    purchaseId: purchase.id,
    processedAt: new Date(),
  })

  revalidatePath('/')
  return { purchase }
}

// --- OCR pipeline (docs/08_OCR_RECEIPT_PIPELINE.md) ---------------------------------------------

/** Runs the OCR pipeline's automated stages (docs/08_OCR_RECEIPT_PIPELINE.md sections 3–9) against
 *  an already-uploaded receipt image, updating the same `receipt_imports` row throughout rather
 *  than creating a new one per stage. `textExtractor`/`structuringProvider` are injectable so the
 *  orchestration logic itself — the state transitions, validation gate, and duplicate check — can
 *  be integration-tested with fakes, independently of whether real Google Vision/Gemini
 *  credentials are configured. Never throws: every failure is recorded on the row as
 *  `ocr_failed`/`parsing_failed` with an `errorMessage`, so the caller always gets back a row to
 *  show the household, per section 19 ("show the specific reason, not a bare error"). */
export async function processReceiptImport(
  receiptImportId: string,
  deps: { textExtractor: ReceiptTextExtractor; structuringProvider: ReceiptStructuringProvider } = {
    textExtractor: googleVisionTextExtractor,
    structuringProvider: geminiStructuringProvider,
  },
): Promise<typeof schema.receiptImports.$inferSelect> {
  const db = getDb()
  const row = await db.query.receiptImports.findFirst({ where: eq(schema.receiptImports.id, receiptImportId) })
  if (!row) throw new Error('Receipt import not found')
  if (!row.imageUrl) throw new Error('Receipt import has no image to process')

  async function update(values: Partial<typeof schema.receiptImports.$inferInsert>) {
    const [updated] = await db
      .update(schema.receiptImports)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.receiptImports.id, receiptImportId))
      .returning()
    return updated
  }

  await update({ status: 'ocr_processing' })

  let base64: string
  try {
    const result = await get(row.imageUrl, { access: 'private' })
    if (!result || result.statusCode !== 200 || !result.stream) throw new Error('Photo not found in storage')
    const buffer = Buffer.from(await new Response(result.stream).arrayBuffer())
    base64 = buffer.toString('base64')
  } catch (error) {
    return update({ status: 'ocr_failed', errorMessage: `Nepodařilo se načíst uloženou fotografii: ${error instanceof Error ? error.message : String(error)}` })
  }

  let ocrText: string
  try {
    const ocrResult = await deps.textExtractor.extractText({ base64, mimeType: 'image/jpeg' })
    ocrText = ocrResult.fullText
  } catch (error) {
    return update({ status: 'ocr_failed', errorMessage: `Nepodařilo se přečíst účtenku. Zkuste nahrát ostřejší fotografii. (${error instanceof Error ? error.message : String(error)})` })
  }

  await update({ status: 'ocr_completed', rawOcrText: ocrText })
  await update({ status: 'parsing' })

  let extracted: ExtractedReceipt
  try {
    const normalized = normalizeOcrText(ocrText)
    extracted = await deps.structuringProvider.structure(normalized)
  } catch (error) {
    return update({ status: 'parsing_failed', errorMessage: `Nepodařilo se rozpoznat položky na účtence. (${error instanceof Error ? error.message : String(error)})` })
  }

  const parsedRow = await update({
    status: 'parsed',
    parserResult: JSON.stringify(extracted),
    date: extracted.date,
    receiptTime: extracted.time,
    receiptNumber: extracted.receiptNumber,
    currency: extracted.currency ?? 'CZK',
    subtotal: extracted.subtotal?.toString(),
    discountTotal: extracted.discountTotal?.toString(),
    total: extracted.total?.toString(),
    confidence: extracted.confidence?.toString(),
    items: JSON.stringify(toReceiptLineItems(extracted)),
  })

  await update({ status: 'validating' })

  if (needsReview(extracted)) {
    return update({ status: 'review_required' })
  }

  // Duplicate check: same household, same date, matched by receipt number or by store+total.
  const extractedDate = extracted.date
  const extractedTotal = extracted.total
  if (extractedDate && extractedTotal != null) {
    const candidates = await db.query.receiptImports.findMany({
      where: and(eq(schema.receiptImports.householdId, row.householdId), gte(schema.receiptImports.date, extractedDate)),
    })
    const duplicate = candidates.find(
      (candidate) =>
        candidate.id !== receiptImportId &&
        candidate.purchaseId != null &&
        candidate.date != null &&
        candidate.total != null &&
        isPotentialDuplicate(
          { storeLocationId: candidate.storeLocationId, date: candidate.date, total: Number(candidate.total), receiptNumber: candidate.receiptNumber },
          { storeLocationId: parsedRow.storeLocationId, date: extractedDate, total: extractedTotal, receiptNumber: extracted.receiptNumber },
        ),
    )
    if (duplicate) return update({ status: 'duplicate_review' })
  }

  const lineItems = toReceiptLineItems(extracted)
  const purchase = await createPurchaseFromReceiptItems(row.householdId, lineItems, { date: extracted.date ?? TODAY, storeLocationId: parsedRow.storeLocationId })
  return update({ status: 'completed', purchaseId: purchase.id, processedAt: new Date() })
}

/** Upload step (docs/08_OCR_RECEIPT_PIPELINE.md section 2): validates the image, stores it in
 *  Vercel Blob (private — a household's receipts are personal financial data), creates the
 *  `receipt_imports` row, and immediately runs the pipeline. Runs synchronously in one request —
 *  at the target volume (~1,500/month per section 18), a background job queue would be
 *  over-engineering for what's a few-second round trip. */
export async function uploadReceiptAction(base64Image: string, mimeType: string): Promise<ReceiptImportState> {
  const householdId = await requireHouseholdId()
  if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error('Nepodporovaný formát obrázku. Použijte JPEG, PNG, WEBP nebo HEIC.')

  const buffer = Buffer.from(base64Image, 'base64')
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('Fotografie je příliš velká (max. 10 MB).')
  if (buffer.byteLength === 0) throw new Error('Nahraný soubor je prázdný.')

  const extension = mimeType.split('/')[1] ?? 'jpg'
  const blob = await put(`receipts/${householdId}/${crypto.randomUUID()}.${extension}`, buffer, {
    access: 'private',
    contentType: mimeType,
  })

  const db = getDb()
  const [row] = await db
    .insert(schema.receiptImports)
    .values({ householdId, status: 'uploaded', source: 'ocr', imageUrl: blob.url })
    .returning()

  const finalRow = await processReceiptImport(row.id)
  revalidatePath('/')
  return toReceiptImportState(finalRow)
}

/** Retry (docs/08_OCR_RECEIPT_PIPELINE.md section 13): reprocesses the same stored image without
 *  requiring a new upload. Only meaningful from a failure state — retrying a completed or
 *  in-review import would silently redo work the household already has results for. */
export async function retryReceiptImportAction(receiptImportId: string): Promise<ReceiptImportState> {
  const householdId = await requireHouseholdId()
  const row = await assertOwnsReceiptImport(householdId, receiptImportId)
  if (row.status !== 'ocr_failed' && row.status !== 'parsing_failed') {
    throw new Error('Tento import nelze znovu spustit — není ve stavu chyby.')
  }
  const finalRow = await processReceiptImport(receiptImportId)
  revalidatePath('/')
  return toReceiptImportState(finalRow)
}

/** Manual review (docs/08_OCR_RECEIPT_PIPELINE.md section 14): the household corrects/confirms the
 *  extracted items for a `review_required` import, which then creates the real purchase exactly
 *  like a fully-automatic pass would. */
export async function confirmReceiptReviewAction(
  receiptImportId: string,
  items: ReceiptLineItem[],
  options: { date?: string; storeLocationId?: string } = {},
): Promise<{ purchase: PurchaseRecord }> {
  const householdId = await requireHouseholdId()
  const row = await assertOwnsReceiptImport(householdId, receiptImportId)
  if (row.status !== 'review_required' && row.status !== 'duplicate_review') {
    throw new Error('Tento import nečeká na kontrolu.')
  }

  const purchase = await createPurchaseFromReceiptItems(householdId, items, { date: options.date ?? row.date ?? TODAY, storeLocationId: options.storeLocationId ?? row.storeLocationId })

  const db = getDb()
  await db
    .update(schema.receiptImports)
    .set({ status: 'completed', items: JSON.stringify(items), purchaseId: purchase.id, processedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.receiptImports.id, receiptImportId))

  revalidatePath('/')
  return { purchase }
}

/** Duplicate resolution (docs/08_OCR_RECEIPT_PIPELINE.md section 9): the household decides whether
 *  a `duplicate_review` import is genuinely a new purchase or the same one already recorded.
 *  'use_existing' and 'cancel' both discard this import without creating a second purchase;
 *  'save_new' proceeds exactly like confirming a review. */
export async function resolveDuplicateReceiptAction(
  receiptImportId: string,
  resolution: 'save_new' | 'use_existing' | 'cancel',
  items?: ReceiptLineItem[],
): Promise<{ purchase: PurchaseRecord | null }> {
  const householdId = await requireHouseholdId()
  const row = await assertOwnsReceiptImport(householdId, receiptImportId)
  if (row.status !== 'duplicate_review') throw new Error('Tento import nečeká na vyřešení duplicity.')

  if (resolution !== 'save_new') {
    const db = getDb()
    await db.update(schema.receiptImports).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(schema.receiptImports.id, receiptImportId))
    revalidatePath('/')
    return { purchase: null }
  }

  const finalItems = items ?? (row.items ? (JSON.parse(row.items) as ReceiptLineItem[]) : [])
  const { purchase } = await confirmReceiptReviewAction(receiptImportId, finalItems)
  return { purchase }
}

/** Discards an import outright (docs/08_OCR_RECEIPT_PIPELINE.md's `CANCELLED` state) — e.g. the
 *  household decides the uploaded photo wasn't actually a usable receipt. Deletes the stored image
 *  too, since nothing will ever retry it. */
export async function cancelReceiptImportAction(receiptImportId: string): Promise<void> {
  const householdId = await requireHouseholdId()
  const row = await assertOwnsReceiptImport(householdId, receiptImportId)
  if (row.purchaseId) throw new Error('Tento import už vytvořil nákup — nelze zrušit.')

  const db = getDb()
  await db.update(schema.receiptImports).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(schema.receiptImports.id, receiptImportId))
  if (row.imageUrl) await del(row.imageUrl).catch(() => {}) // best-effort — a leftover blob is harmless, unlike losing the cancellation
  revalidatePath('/')
}
