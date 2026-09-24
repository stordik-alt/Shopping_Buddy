import { extractText, getDocumentProxy } from 'unpdf'

// Reading the text a digital PDF receipt already carries, before any OCR.
//
// A receipt exported from a shop's app or printed to PDF from a browser (Albert's e-receipt is a
// "Skia/PDF" browser print) has an embedded text layer with every character exactly as the shop
// wrote it. OCR of such a file is strictly worse — it re-reads pixels, and on a real Albert
// receipt the Azure fallback dropped the "0.43 x 34.90 Kč" lines of two weighed items that the
// text layer holds verbatim — and costs a paid call. So a PDF's own text is tried first and OCR
// only runs when there is none (a scanned or photographed PDF) or it isn't receipt-like.
// (CLAUDE.md section 31: never use a service where a plain algorithm is sufficient.)

/** Recorded as `receipt_imports.ocr_provider` when the text came from the PDF itself. */
export const PDF_TEXT_LAYER_PROVIDER = 'pdf_text_layer'

// Same limit as the Google PDF path (its request allows five pages) — a receipt is one page, a long
// PDF is not a receipt.
const MAX_PAGES = 5
// A real receipt's text has a few dozen characters and several amounts even for one item; anything
// below this is a stray label or a scan whose only text is a watermark or a page number.
const MIN_NON_SPACE_CHARS = 60
const MIN_AMOUNTS = 3

/** Whether extracted text looks like a receipt: enough characters and at least a few amounts with
 *  two decimals ("13.90", "1 055,00"). A PDF whose text layer is only a footer or a page number
 *  fails this and goes on to OCR. */
export function isUsableReceiptText(text: string): boolean {
  if (text.replace(/\s+/g, '').length < MIN_NON_SPACE_CHARS) return false
  return (text.match(/\d+[.,]\d{2}(?!\d)/g) ?? []).length >= MIN_AMOUNTS
}

export type PdfTextLayerResult = { text: string } | { text: null; reason: string }

/** The PDF's embedded text, or `null` with the reason it can't be used (so the caller can log why
 *  OCR ran). Never throws: an unreadable file simply has no usable text layer and OCR gets its
 *  turn, which then produces the user-facing error if it fails too. */
export async function readPdfTextLayer(base64: string): Promise<PdfTextLayerResult> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, 'base64')))
    const { text } = await extractText(pdf, { mergePages: false })
    const joined = text.slice(0, MAX_PAGES).join('\n')
    if (!isUsableReceiptText(joined)) return { text: null, reason: 'the PDF has no usable text layer (scanned or image-only)' }
    return { text: joined }
  } catch (error) {
    return { text: null, reason: `the PDF text could not be read: ${error instanceof Error ? error.message : String(error)}` }
  }
}
