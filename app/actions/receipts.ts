'use server'

import { requireHouseholdId } from '@/lib/auth/authorize'
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
import { type ReceiptLineItem } from '@/lib/receipts'
import type { PurchaseRecord } from '@/lib/types'
import {
  cancelReceiptImportForHousehold,
  confirmReceiptReviewForHousehold,
  importManualReceiptForHousehold,
  processReceiptImportForHousehold,
  resolveDuplicateReceiptForHousehold,
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
  const { purchase, aftermath } = await importManualReceiptForHousehold(householdId, items.map(withClassificationSource), options)
  // No revalidatePath: what the import changed is returned instead of re-rendering the whole page.
  return { purchase, aftermath }
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
  return confirmReceiptReviewForHousehold(householdId, receiptImportId, items.map(withClassificationSource), options)
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
  return resolveDuplicateReceiptForHousehold(householdId, receiptImportId, resolution, items?.map(withClassificationSource), options)
}

/** Discards an import outright (docs/08_OCR_RECEIPT_PIPELINE.md's `CANCELLED` state) — e.g. the
 *  household decides the uploaded photo wasn't actually a usable receipt. Deletes the stored image
 *  too, since nothing will ever retry it. */
export async function cancelReceiptImportAction(receiptImportId: string): Promise<void> {
  const householdId = await requireHouseholdId()
  await cancelReceiptImportForHousehold(householdId, receiptImportId)
}
