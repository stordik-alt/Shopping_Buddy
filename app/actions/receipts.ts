'use server'

import { and, count, eq, gte, inArray, lt, or } from 'drizzle-orm'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { todayInPrague } from '@/lib/today'
import { getDb } from '@/lib/db/client'
import {
  getPurchaseAftermath,
  getTickedListItems,
  toReceiptImportState,
  type PurchaseAftermath,
  type ReceiptImportState,
  type TickedListItem,
} from '@/lib/db/queries'
import * as schema from '@/lib/db/schema'
import { applyConfirmedReceiptListPairs, getReceiptListSuggestions, type ReceiptListSuggestion } from '@/lib/db/receipt-list'
import { detectReceiptFileType } from '@/lib/receipt-image'
import { RECEIPT_STALE_MS } from '@/lib/receipt-progress'
import type { ReceiptListPair } from '@/lib/receipt-list-match'
import { type ExtractedReceipt, type ReceiptLineItem } from '@/lib/receipts'
import { HEIC_UNSUPPORTED_MESSAGE } from '@/lib/receipt-upload'
import { mayUploadReceipt, RECEIPT_UPLOAD_LIMIT_MESSAGE, RECEIPT_UPLOAD_WINDOW_MS } from '@/lib/receipt-upload-limit'
import { reserveReceiptOcrAttempt } from '@/lib/receipt-ocr-rate-limit'
import { deleteReceiptFile, putReceiptFile } from '@/lib/storage'
import type { PurchaseRecord } from '@/lib/types'
import {
  assertOwnsReceiptImport,
  createPurchaseFromReceiptItems,
  findOrCreateStore,
  findOrCreateStoreLocation,
  MAX_IMAGE_BYTES,
  processReceiptImport,
  resolveReceiptPurchaseDate,
} from '@/lib/receipt-import'


/** Suggested (not certain) matches between a just-imported receipt and the open shopping list, for
 *  the household to confirm. Certain matches were already ticked when the purchase was created. */
export async function getReceiptListSuggestionsAction(purchaseId: string): Promise<ReceiptListSuggestion[]> {
  const householdId = await requireHouseholdId()
  return getReceiptListSuggestions(householdId, purchaseId)
}

/** Ticks the suggestions the household confirmed. Only pairs the server itself proposes are
 *  applied, and the quantity/price written to the list come from the stored purchase. */
export async function applyReceiptListMatchesAction(purchaseId: string, pairs: ReceiptListPair[]): Promise<{ checked: number; tickedListItems: TickedListItem[] }> {
  const householdId = await requireHouseholdId()
  const checked = await applyConfirmedReceiptListPairs(householdId, purchaseId, pairs)
  // No revalidatePath (it would re-render the whole page): the ticked items are returned for the list to merge.
  return { checked, tickedListItems: await getTickedListItems(householdId, purchaseId) }
}

/** Keeps the form's own "the household changed this category" marker and nothing else a client
 *  might send in the field. Every row used to be marked as hand-classified here, so a manually
 *  entered "KUBÍK W.VIŠEŇ 0,5L" took the form's default Potraviny and re-filed the shared catalog
 *  product under it (found by a browser check, 2026-10-06). */
function withClassificationSource(item: ReceiptLineItem): ReceiptLineItem {
  const { classificationSource, ...rest } = item
  return classificationSource === 'manual' ? { ...rest, classificationSource } : rest
}

/** Turns a manually-entered receipt into a real purchase, and keeps a `receipt_imports` record so
 *  a future OCR provider's output stays auditable/reprocessable, extending CLAUDE.md section 16's
 *  price/deal provenance rule to purchases too. Every manual import goes straight to `imported` —
 *  there's no OCR/AI step to fail or need review. */
export async function importReceiptAction(
  items: ReceiptLineItem[],
  options: { date?: string; storeLocationId?: string; storeName?: string; currency?: string } = {},
): Promise<{ purchase: PurchaseRecord; aftermath: PurchaseAftermath }> {
  const householdId = await requireHouseholdId()
  // Only a category the household actually changed in the form is authoritative; an untouched row
  // follows the catalog (lib/receipt-import.ts).
  const purchase = await createPurchaseFromReceiptItems(householdId, items.map(withClassificationSource), { ...options, source: 'confirmed' })

  const db = getDb()
  await db.insert(schema.receiptImports).values({
    householdId,
    status: 'imported',
    storeId: options.storeName ? await findOrCreateStore(options.storeName) : null,
    storeLocationId: options.storeLocationId,
    date: options.date ?? todayInPrague(),
    source: 'manual',
    items: JSON.stringify(items),
    purchaseId: purchase.id,
    processedAt: new Date(),
  })

  // No revalidatePath: what the import changed is returned instead of re-rendering the whole page.
  return { purchase, aftermath: await getPurchaseAftermath(householdId, purchase.id) }
}


/** Upload step (docs/08_OCR_RECEIPT_PIPELINE.md section 2): validates the image, stores it in
 *  private storage (R2 via lib/storage — a household's receipts are personal
 *  financial data) and creates the
 *  `receipt_imports` row in `uploaded`. Processing is a separate call
 *  (`processUploadedReceiptAction`) so the client knows the import id while the pipeline runs and
 *  can show its real progress via `/api/receipts/[id]/status` (section 20). The pipeline still runs
 *  synchronously inside that one request — at the target volume (~1,500/month per section 18) a
 *  background job queue would be over-engineering for a few-second round trip. */
/** What the upload returns. A problem the user can act on (too large, wrong format, HEIC) comes back
 *  as `ok: false` with a Czech message instead of being thrown: in production Next.js replaces the
 *  message of an error thrown inside a Server Action with a generic one, so the phone showed only
 *  "Minified React error #441" and the user never learned why (CLAUDE.md section 26). */
export type UploadReceiptResult = { ok: true; receipt: ReceiptImportState } | { ok: false; error: string }

export async function uploadReceiptAction(formData: FormData): Promise<UploadReceiptResult> {
  const householdId = await requireHouseholdId()

  // The photo is sent as a binary `File` in FormData rather than a base64 string argument. React's
  // Server Action decoder adds the length of every string it resolves to the size of the action's
  // argument array and throws "Maximum array nesting exceeded" past 1,000,000 characters (fixed,
  // not configurable) — so a base64 photo over ~750 KB failed in production. A File is not counted,
  // and it also avoids base64's 33 % overhead.
  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'Nahraný soubor je neplatný.' }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: 'Fotografie je příliš velká (max. 10 MB).' }
  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.byteLength === 0) return { ok: false, error: 'Nahraný soubor je prázdný.' }

  // The type is decided from the file's own bytes; the client-declared MIME type (`file.type`) is
  // ignored because it is attacker-controlled and phones sometimes mislabel files. The stored
  // extension and content type come from the detection.
  const fileType = detectReceiptFileType(buffer)
  if (fileType.kind === 'heic') return { ok: false, error: HEIC_UNSUPPORTED_MESSAGE }
  if (fileType.kind !== 'supported') return { ok: false, error: 'Nepodporovaný formát. Použijte fotku JPEG, PNG, WEBP nebo PDF.' }

  try {
    // Checked after the cheap file checks and before anything is stored or sent to OCR, so a refused
    // upload costs nothing. Counted from the household's own OCR imports of the last 24 hours.
    const db = getDb()
    const [{ recent }] = await db
      .select({ recent: count() })
      .from(schema.receiptImports)
      .where(and(eq(schema.receiptImports.householdId, householdId), eq(schema.receiptImports.source, 'ocr'), gte(schema.receiptImports.createdAt, new Date(Date.now() - RECEIPT_UPLOAD_WINDOW_MS))))
    if (!mayUploadReceipt(recent)) return { ok: false, error: RECEIPT_UPLOAD_LIMIT_MESSAGE }

    // Receipt files are stored in R2 through lib/storage.
    const imageUrl = await putReceiptFile(householdId, buffer, fileType)

    const [row] = await db
      .insert(schema.receiptImports)
      .values({ householdId, status: 'uploaded', source: 'ocr', imageUrl })
      .returning()

    return { ok: true, receipt: toReceiptImportState(row) }
  } catch (err) {
    // Storage or database failure: the details go to the server log (with the household, never the
    // photo), the user gets a message they can act on.
    console.error(
      JSON.stringify({ event: 'receipt_upload_failed', householdId, bytes: buffer.byteLength, type: fileType.mimeType, error: err instanceof Error ? err.message : String(err) }),
    )
    return { ok: false, error: 'Fotografii se nepodařilo uložit. Zkuste to prosím za chvíli znovu.' }
  }
}

const IN_FLIGHT_STATUSES: (typeof schema.receiptStatusEnum.enumValues)[number][] = ['ocr_processing', 'ocr_completed', 'parsing', 'parsed', 'validating']

/** Atomically takes ownership of an import for processing. The single conditional UPDATE is what
 *  prevents two concurrent requests (a double-click, two household members, a retry racing the
 *  original run) from both running the pipeline and both creating a purchase — whichever UPDATE
 *  matches wins, the other gets no row. An import stuck mid-run (the function was killed) becomes
 *  claimable again once it has not changed for `RECEIPT_STALE_MS`. Clears the previous error so a
 *  successful retry does not keep showing the earlier failure. */
async function claimReceiptImport(
  householdId: string,
  receiptImportId: string,
  claimableStatuses: (typeof schema.receiptStatusEnum.enumValues)[number][],
): Promise<boolean> {
  const staleBefore = new Date(Date.now() - RECEIPT_STALE_MS)
  const claimed = await getDb()
    .update(schema.receiptImports)
    .set({ status: 'ocr_processing', errorMessage: null, updatedAt: new Date() })
    .where(
      and(
        eq(schema.receiptImports.id, receiptImportId),
        eq(schema.receiptImports.householdId, householdId),
        or(
          inArray(schema.receiptImports.status, claimableStatuses),
          and(inArray(schema.receiptImports.status, IN_FLIGHT_STATUSES), lt(schema.receiptImports.updatedAt, staleBefore)),
        ),
      ),
    )
    .returning({ id: schema.receiptImports.id })
  return claimed.length > 0
}

/** An import's state, plus — when the run completed outright and created a purchase — what that
 *  purchase changed, so the page can show it without a full refresh. */
export type ReceiptImportResult = ReceiptImportState & { aftermath: PurchaseAftermath | null }

async function toReceiptImportResult(householdId: string, row: typeof schema.receiptImports.$inferSelect): Promise<ReceiptImportResult> {
  return { ...toReceiptImportState(row), aftermath: row.purchaseId ? await getPurchaseAftermath(householdId, row.purchaseId) : null }
}

/** Runs the pipeline for a freshly uploaded import (called by the client right after
 *  `uploadReceiptAction`, which is what lets it poll the status route meanwhile). */
export async function processUploadedReceiptAction(receiptImportId: string): Promise<ReceiptImportResult> {
  const householdId = await requireHouseholdId()
  await assertOwnsReceiptImport(householdId, receiptImportId)
  const rateLimit = await reserveReceiptOcrAttempt(householdId)
  if (!rateLimit.allowed) throw new Error(rateLimit.error)
  if (!(await claimReceiptImport(householdId, receiptImportId, ['uploaded']))) {
    throw new Error('Tento import se už zpracovává nebo je zpracovaný.')
  }
  const finalRow = await processReceiptImport(receiptImportId)
  return toReceiptImportResult(householdId, finalRow)
}

/** Retry (docs/08_OCR_RECEIPT_PIPELINE.md section 13): reprocesses the same stored image without
 *  requiring a new upload. Only meaningful from a failure state — retrying a completed or
 *  in-review import would silently redo work the household already has results for — or for an
 *  import that was uploaded but never started (the browser closed before processing began). */
export async function retryReceiptImportAction(receiptImportId: string): Promise<ReceiptImportResult> {
  const householdId = await requireHouseholdId()
  await assertOwnsReceiptImport(householdId, receiptImportId)
  const rateLimit = await reserveReceiptOcrAttempt(householdId)
  if (!rateLimit.allowed) throw new Error(rateLimit.error)
  if (!(await claimReceiptImport(householdId, receiptImportId, ['ocr_failed', 'parsing_failed', 'uploaded']))) {
    throw new Error('Tento import nelze znovu spustit — není ve stavu chyby.')
  }
  const finalRow = await processReceiptImport(receiptImportId)
  return toReceiptImportResult(householdId, finalRow)
}

/** Manual review (docs/08_OCR_RECEIPT_PIPELINE.md section 14): the household corrects/confirms the
 *  extracted items for a `review_required` import, which then creates the real purchase exactly
 *  like a fully-automatic pass would. */
export async function confirmReceiptReviewAction(
  receiptImportId: string,
  items: ReceiptLineItem[],
  options: { date?: string; storeLocationId?: string } = {},
): Promise<{ purchase: PurchaseRecord; aftermath: PurchaseAftermath }> {
  const householdId = await requireHouseholdId()
  const row = await assertOwnsReceiptImport(householdId, receiptImportId)
  if (row.status !== 'review_required' && row.status !== 'duplicate_review') {
    throw new Error('Tento import nečeká na kontrolu.')
  }

  // Never fall back to today's date (docs/08_OCR_RECEIPT_PIPELINE.md section 12 / CLAUDE.md
  // section 5 "never invent data") — if OCR couldn't read the date, the household must supply it
  // here explicitly. `resolveReceiptPurchaseDate()` (inside createPurchaseFromReceiptItems) is what
  // actually enforces this — `options.date` (explicitly supplied here) falls back to `row.date`
  // (the OCR-read date, for a review triggered by something other than a missing date, e.g. an
  // inconsistent total) and throws rather than defaulting to today if neither is present.
  const extractedReview = row.parserResult ? (JSON.parse(row.parserResult) as ExtractedReceipt) : null
  let storeId = row.storeId ?? (extractedReview ? await findOrCreateStore(extractedReview.store.name) : null)
  let resolvedStoreLocationId = options.storeLocationId ?? row.storeLocationId ?? null
  if (resolvedStoreLocationId == null && extractedReview) {
    // The branch may be in another chain of the same retailer (lib/stores/chain-family.ts).
    const branch = await findOrCreateStoreLocation(storeId, extractedReview.store.address, extractedReview.store.city)
    storeId = branch.storeId
    resolvedStoreLocationId = branch.storeLocationId
  }
  const confirmedItems = items.map(withClassificationSource)
  const purchase = await createPurchaseFromReceiptItems(householdId, confirmedItems, {
    date: options.date,
    storedDate: row.date,
    storeLocationId: resolvedStoreLocationId,
    storeId,
    currency: row.currency,
    receiptDiscountTotal: row.discountTotal != null ? Number(row.discountTotal) : null,
    receiptStatedTotal: row.total != null ? Number(row.total) : null,
    source: 'confirmed',
  })

  const db = getDb()
  await db
    .update(schema.receiptImports)
    .set({ status: 'completed', items: JSON.stringify(items), storeLocationId: resolvedStoreLocationId, purchaseId: purchase.id, processedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.receiptImports.id, receiptImportId))

  return { purchase, aftermath: await getPurchaseAftermath(householdId, purchase.id) }
}

/** Duplicate resolution (docs/08_OCR_RECEIPT_PIPELINE.md section 9): the household decides whether
 *  a `duplicate_review` import is genuinely a new purchase or the same one already recorded.
 *  'use_existing' and 'cancel' both discard this import without creating a second purchase;
 *  'save_new' proceeds exactly like confirming a review. */
export async function resolveDuplicateReceiptAction(
  receiptImportId: string,
  resolution: 'save_new' | 'use_existing' | 'cancel',
  items?: ReceiptLineItem[],
  options: { date?: string } = {},
): Promise<{ purchase: PurchaseRecord | null; aftermath: PurchaseAftermath | null }> {
  const householdId = await requireHouseholdId()
  const row = await assertOwnsReceiptImport(householdId, receiptImportId)
  if (row.status !== 'duplicate_review') throw new Error('Tento import nečeká na vyřešení duplicity.')

  if (resolution !== 'save_new') {
    const db = getDb()
    await db.update(schema.receiptImports).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(schema.receiptImports.id, receiptImportId))
    return { purchase: null, aftermath: null }
  }

  const finalItems = items ?? (row.items ? (JSON.parse(row.items) as ReceiptLineItem[]) : [])
  return confirmReceiptReviewAction(receiptImportId, finalItems, options)
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
  // Best-effort: a leftover file is harmless, unlike losing the cancellation — but it is logged.
  if (row.imageUrl) {
    await deleteReceiptFile(row.imageUrl).catch((err) =>
      console.error(JSON.stringify({ event: 'receipt_file_delete_failed', receiptImportId, error: err instanceof Error ? err.message : String(err) })),
    )
  }
}