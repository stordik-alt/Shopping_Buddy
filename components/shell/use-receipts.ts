'use client'

import { useEffect, useState } from 'react'
import {
  applyReceiptListMatchesAction,
  cancelReceiptImportAction,
  confirmReceiptReviewAction,
  getReceiptListSuggestionsAction,
  importReceiptAction,
  processUploadedReceiptAction,
  resolveDuplicateReceiptAction,
  retryReceiptImportAction,
  uploadReceiptAction,
} from '@/app/actions/receipts'
import type { PurchaseAftermath, ReceiptImportState, TickedListItem } from '@/lib/db/queries'
import type { ReceiptListSuggestion } from '@/lib/db/receipt-list'
import { pollReceiptStatus } from '@/lib/receipt-progress'
import type { ReceiptLineItem } from '@/lib/receipts'

/** Receipt import: imports waiting on the household, and the matches offered against the shopping list. */
export function useReceipts({
  initialPending,
  applyPurchaseAftermath,
  applyTickedListItems,
}: {
  initialPending: ReceiptImportState[]
  applyPurchaseAftermath: (aftermath: PurchaseAftermath) => void
  applyTickedListItems: (ticked: TickedListItem[]) => void
}) {
  const [pendingReceiptImports, setPendingReceiptImports] = useState(initialPending)
  // Plausible receipt ↔ shopping-list matches waiting for the household to confirm (certain ones were
  // ticked on the server already).
  const [listSuggestions, setListSuggestions] = useState<{ purchaseId: string; items: ReceiptListSuggestion[] } | null>(null)

  useEffect(() => {
    setPendingReceiptImports(initialPending)
  }, [initialPending])

  /** Asks the server which open shopping-list items a just-imported purchase plausibly covers. The
   *  import itself has already succeeded, so a failure here is logged rather than shown as an import
   *  error; the household can still tick the items by hand. */
  async function offerListMatches(purchaseId: string | null | undefined) {
    if (!purchaseId) return
    try {
      const suggestions = await getReceiptListSuggestionsAction(purchaseId)
      setListSuggestions(suggestions.length > 0 ? { purchaseId, items: suggestions } : null)
    } catch (error) {
      console.error('Could not load shopping-list suggestions for the receipt', error)
    }
  }

  async function confirmListSuggestions(selected: ReceiptListSuggestion[]) {
    if (!listSuggestions) return
    const { tickedListItems } = await applyReceiptListMatchesAction(
      listSuggestions.purchaseId,
      selected.map((suggestion) => ({ listItemId: suggestion.listItemId, purchaseItemId: suggestion.purchaseItemId })),
    )
    setListSuggestions(null)
    applyTickedListItems(tickedListItems) // the list shows the newly ticked items with their real price and quantity
  }

  async function importReceipt(items: ReceiptLineItem[], options: { date?: string; storeLocationId?: string }) {
    const { purchase, aftermath } = await importReceiptAction(items, options)
    applyPurchaseAftermath(aftermath)
    await offerListMatches(purchase.id)
  }

  function upsertPendingReceipt(result: ReceiptImportState) {
    setPendingReceiptImports((current) => {
      const withoutThis = current.filter((r) => r.id !== result.id)
      const stillPending = result.status !== 'completed' && result.status !== 'cancelled'
      return stillPending ? [...withoutThis, result] : withoutThis
    })
  }

  /** Two calls so the import id is known while the pipeline runs: upload stores the photo, then
   *  processing runs the whole OCR pipeline in one request. While that request is in flight, the
   *  status route is polled (a route handler, not an action — Next runs one client's actions
   *  sequentially, so an action would queue behind the processing call) to report the real stage. */
  async function uploadReceipt(file: File, onProgress: (status: string) => void) {
    onProgress('uploading')
    const formData = new FormData()
    formData.set('file', file)
    const upload = await uploadReceiptAction(formData)
    if (!upload.ok) throw new Error(upload.error)
    const uploaded = upload.receipt
    onProgress(uploaded.status)
    const stopPolling = pollReceiptStatus(uploaded.id, onProgress)
    try {
      const { aftermath, ...result } = await processUploadedReceiptAction(uploaded.id)
      upsertPendingReceipt(result)
      if (aftermath) applyPurchaseAftermath(aftermath) // a new purchase/pantry restock if it completed outright
      await offerListMatches(result.purchaseId)
      return result
    } finally {
      stopPolling()
    }
  }

  async function retryReceiptImport(id: string) {
    const { aftermath, ...result } = await retryReceiptImportAction(id)
    upsertPendingReceipt(result)
    if (aftermath) applyPurchaseAftermath(aftermath)
    await offerListMatches(result.purchaseId)
    return result
  }

  async function confirmReceiptReview(id: string, items: ReceiptLineItem[], date: string) {
    const { purchase, aftermath } = await confirmReceiptReviewAction(id, items, { date })
    setPendingReceiptImports((current) => current.filter((r) => r.id !== id))
    applyPurchaseAftermath(aftermath)
    await offerListMatches(purchase.id)
  }

  async function resolveDuplicateReceipt(id: string, resolution: 'save_new' | 'use_existing' | 'cancel', items?: ReceiptLineItem[], date?: string) {
    const { purchase, aftermath } = await resolveDuplicateReceiptAction(id, resolution, items, { date })
    setPendingReceiptImports((current) => current.filter((r) => r.id !== id))
    if (aftermath) applyPurchaseAftermath(aftermath)
    await offerListMatches(purchase?.id)
  }

  function cancelReceiptImport(id: string) {
    setPendingReceiptImports((current) => current.filter((r) => r.id !== id))
    cancelReceiptImportAction(id)
  }

  return {
    pendingReceiptImports,
    listSuggestions,
    dismissListSuggestions: () => setListSuggestions(null),
    confirmListSuggestions,
    importReceipt,
    uploadReceipt,
    retryReceiptImport,
    confirmReceiptReview,
    resolveDuplicateReceipt,
    cancelReceiptImport,
  }
}
