import { and, count, eq, gte } from 'drizzle-orm'
import { safeErrorMessage } from '@/lib/errors'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { toReceiptImportState, type ReceiptImportState } from '@/lib/db/queries'
import { detectReceiptFileType } from '@/lib/receipt-image'
import { HEIC_UNSUPPORTED_MESSAGE } from '@/lib/receipt-upload'
import { mayUploadReceipt, RECEIPT_UPLOAD_LIMIT_MESSAGE, RECEIPT_UPLOAD_WINDOW_MS } from '@/lib/receipt-upload-limit'
import { putReceiptFile } from '@/lib/storage'

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export type UploadReceiptResult =
  | { ok: true; receipt: ReceiptImportState }
  | { ok: false; error: string; code: 'invalid_file' | 'image_too_large' | 'empty_file' | 'unsupported_format' | 'upload_limit' | 'upload_failed' }

export async function uploadReceiptForHousehold(householdId: string, file: unknown): Promise<UploadReceiptResult> {
  if (!(file instanceof File)) return { ok: false, code: 'invalid_file', error: 'Nahraný soubor je neplatný.' }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, code: 'image_too_large', error: 'Fotografie je příliš velká (max. 10 MB).' }
  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.byteLength === 0) return { ok: false, code: 'empty_file', error: 'Nahraný soubor je prázdný.' }

  const fileType = detectReceiptFileType(buffer)
  if (fileType.kind === 'heic') return { ok: false, code: 'unsupported_format', error: HEIC_UNSUPPORTED_MESSAGE }
  if (fileType.kind !== 'supported') {
    return { ok: false, code: 'unsupported_format', error: 'Nepodporovaný formát. Použijte fotku JPEG, PNG, WEBP nebo PDF.' }
  }

  try {
    const db = getDb()
    const [{ recent }] = await db
      .select({ recent: count() })
      .from(schema.receiptImports)
      .where(and(eq(schema.receiptImports.householdId, householdId), eq(schema.receiptImports.source, 'ocr'), gte(schema.receiptImports.createdAt, new Date(Date.now() - RECEIPT_UPLOAD_WINDOW_MS))))
    if (!mayUploadReceipt(recent)) return { ok: false, code: 'upload_limit', error: RECEIPT_UPLOAD_LIMIT_MESSAGE }

    const imageUrl = await putReceiptFile(householdId, buffer, fileType)
    const [row] = await db
      .insert(schema.receiptImports)
      .values({ householdId, status: 'uploaded', source: 'ocr', imageUrl })
      .returning()

    return { ok: true, receipt: toReceiptImportState(row) }
  } catch (err) {
    console.error(
      JSON.stringify({ event: 'receipt_upload_failed', householdId, bytes: buffer.byteLength, type: fileType.mimeType, error: safeErrorMessage(err) }),
    )
    return { ok: false, code: 'upload_failed', error: 'Fotografii se nepodařilo uložit. Zkuste to prosím za chvíli znovu.' }
  }
}
