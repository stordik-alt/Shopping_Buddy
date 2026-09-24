// How the text of a receipt was obtained, in words for the household. Kept in its own tiny module —
// no server or AI imports — because the receipt screens (client components) need it and
// `lib/receipts.ts` pulls in server-only code.

/** The value stored in `receipt_imports.ocr_provider` -> a readable label. Anything unrecognized is
 *  shown as Google Cloud Vision, the primary provider (and what older rows without a newer value
 *  were read with). */
export function ocrProviderLabel(provider: string): string {
  switch (provider) {
    case 'pdf_text_layer':
      return 'Text přímo z PDF (bez OCR)'
    case 'azure_document_intelligence':
      return 'Azure Document Intelligence'
    default:
      return 'Google Cloud Vision'
  }
}
