import type { ItemCategory, ItemUnit } from '@/lib/types'

/** One line item on a receipt — whether typed by hand today or, once a real OCR provider exists,
 *  extracted automatically and then confirmed by the household. Both paths converge on this same
 *  shape before `importReceiptAction` (app/actions/receipts.ts) turns them into a real purchase,
 *  so nothing downstream needs to change when OCR arrives. */
export type ReceiptLineItem = {
  name: string
  category: ItemCategory
  quantity: number
  unit: ItemUnit
  price: number
}

export type ExtractedReceipt = {
  storeGuess?: string
  date?: string
  items: ReceiptLineItem[]
}

/** The seam a real OCR/vision provider plugs into later, per CLAUDE.md section 32's
 *  Fetcher/Connector pattern (External source → Fetcher/Connector → Normalizer → Validator →
 *  Database). Deliberately has no implementation yet — CLAUDE.md section 30 forbids wiring up an
 *  AI SDK/vision-model call before the AI phase. Until a real provider exists, the receipt-import
 *  UI collects `ReceiptLineItem[]` directly from the household instead of calling this. */
export interface ReceiptOcrProvider {
  extract(image: { base64: string; mimeType: string }): Promise<ExtractedReceipt>
}

/** Placeholder — throws rather than pretending to read the image, per CLAUDE.md section 15
 *  ("never pretend that unavailable data is current"). Swap in a real provider implementing the
 *  same interface when the AI phase starts; `importReceiptAction` and the database schema
 *  (`receipt_imports`) do not need to change, since both paths converge on ReceiptLineItem[]. */
export const unimplementedOcrProvider: ReceiptOcrProvider = {
  async extract() {
    throw new Error('No OCR provider is configured yet — enter receipt items manually.')
  },
}

export function receiptTotal(items: ReceiptLineItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}
