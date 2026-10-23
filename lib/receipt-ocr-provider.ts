// How the text of a receipt was obtained, in words for the household. Kept in its own tiny module —
// no server or AI imports — because the receipt screens (client components) need it and
// `lib/receipts.ts` pulls in server-only code.

/** The value stored in `receipt_imports.ocr_provider` -> a readable label. The default covers older
 *  rows that predate provider tracking and were read with Google Cloud Vision. */
export function ocrProviderLabel(provider: string): string {
  switch (provider) {
    case 'pdf_text_layer':
      return 'Text přímo z PDF (bez OCR)'
    case 'azure_document_intelligence':
      return 'Azure Document Intelligence'
    case 'gpt6_luna':
      return 'GPT-6 Luna · Cloudflare AI Gateway'
    default:
      return 'Google Cloud Vision'
  }
}
