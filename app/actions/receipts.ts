'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { parseStoredJson } from '@/lib/safe-json'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { safeErrorMessage } from '@/lib/errors'
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
import type { ReceiptListPair } from '@/lib/receipt-list-match'
import { type ExtractedReceipt, type ReceiptLineItem } from '@/lib/receipts'
import { deleteReceiptFile } from '@/lib/storage'
import type { PurchaseRecord } from '@/lib/types'
import {
  assertOwnsReceiptImport,
  createPurchaseFromReceiptItems,
  findOrCreateStore,
  findOrCreateStoreLocation,
  processReceiptImportForHousehold,
  resolveReceiptPurchaseDate,
} from '@/lib/receipt-import'
import { uploadReceiptForHousehold, type UploadReceiptResult } from '@/lib/receipt-upload-server'


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
export async function uploadReceiptAction(formData: FormData): Promise<UploadReceiptResult> {
  const householdId = await requireHouseholdId()
  return uploadReceiptForHousehold(householdId, formData.get('file'))
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
  const attempt = await processReceiptImportForHousehold(householdId, receiptImportId)
  if (attempt.kind === 'rate_limited') throw new Error(attempt.error)
  if (attempt.kind === 'not_claimed') {
    throw new Error('Tento import se už zpracovává nebo je zpracovaný.')
  }
  return toReceiptImportResult(householdId, attempt.row)
}

/** Retry (docs/08_OCR_RECEIPT_PIPELINE.md section 13): reprocesses the same stored image without
 *  requiring a new upload. Only meaningful from a failure state — retrying a completed or
 *  in-review import would silently redo work the household already has results for — or for an
 *  import that was uploaded but never started (the browser closed before processing began). */
export async function retryReceiptImportAction(receiptImportId: string): Promise<ReceiptImportResult> {
  const householdId = await requireHouseholdId()
  const attempt = await processReceiptImportForHousehold(householdId, receiptImportId, true)
  if (attempt.kind === 'rate_limited') throw new Error(attempt.error)
  if (attempt.kind === 'not_claimed') {
    throw new Error('Tento import nelze znovu spustit — není ve stavu chyby.')
  }
  return toReceiptImportResult(householdId, attempt.row)
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
  const extractedReview = row.parserResult ? parseStoredJson<ExtractedReceipt>(row.parserResult, `receipt_imports.parser_result ${receiptImportId}`) : null
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

  const storedItems = row.items ? parseStoredJson<ReceiptLineItem[]>(row.items, `receipt_imports.items ${receiptImportId}`) : []
  // Damaged stored lines must not be saved as an empty receipt; the household re-checks the receipt instead.
  if (!items && storedItems === null) throw new Error('Uložené položky účtenky se nepodařilo přečíst. Zkontrolujte účtenku znovu.')
  const finalItems = items ?? storedItems ?? []
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
      console.error(JSON.stringify({ event: 'receipt_file_delete_failed', receiptImportId, error: safeErrorMessage(err) })),
    )
  }
}