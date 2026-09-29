import { createAzureTextExtractor, googleVisionTextExtractor, isAzureReceiptFallbackConfigured, type ReceiptTextExtractor } from '@/lib/receipts'
import { fetchWithTimeout } from '@/lib/ingestion/http'
import type { FlyerPage } from '@/lib/ingestion/flyer'

// OCR of a flyer page's image, for a retailer whose own page data has no usable text layer (Lidl: a
// keyword bag that loses most prices). Google Cloud Vision reads first; when it fails or finds no
// text, Azure Document Intelligence (plain `prebuilt-read`) reads instead — the same two providers,
// in the same order, as the receipt import (lib/receipts.ts). The text is used only to confirm what a
// model read (validateFlyerOffer); it is never a source of prices on its own.

const azureReadExtractor = createAzureTextExtractor('prebuilt-read')

/** Text of an image: the primary provider, else the fallback. Throws (with both reasons) when neither
 *  can read it, so the page is left for the next run instead of being cached without text. */
export async function extractTextWithFallback(
  image: { base64: string; mimeType: string },
  providers: { primary: ReceiptTextExtractor; fallback?: ReceiptTextExtractor },
): Promise<string> {
  let primaryError: string
  try {
    return (await providers.primary.extractText(image)).fullText
  } catch (err) {
    primaryError = err instanceof Error ? err.message : String(err)
  }
  if (!providers.fallback) throw new Error(`OCR failed: ${primaryError}`)
  try {
    return (await providers.fallback.extractText(image)).fullText
  } catch (err) {
    throw new Error(`OCR failed: ${primaryError}; fallback: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Reads a flyer page's image by OCR. */
export async function readFlyerPageText(page: FlyerPage, get: typeof fetchWithTimeout = fetchWithTimeout): Promise<string> {
  const response = await get(page.imageUrl)
  if (!response.ok) throw new Error(`flyer page image failed: HTTP ${response.status}`)
  const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
  const base64 = Buffer.from(await response.arrayBuffer()).toString('base64')
  return extractTextWithFallback(
    { base64, mimeType },
    { primary: googleVisionTextExtractor, fallback: isAzureReceiptFallbackConfigured() ? azureReadExtractor : undefined },
  )
}
