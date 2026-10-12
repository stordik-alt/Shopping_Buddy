import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { hitRateLimit } from '@/lib/db/rate-limit'
import { MAX_RECEIPT_UPLOADS_PER_DAY, RECEIPT_GLOBAL_LIMIT_MESSAGE, RECEIPT_UPLOAD_LIMIT_MESSAGE, RECEIPT_UPLOAD_WINDOW_MS, receiptOcrGlobalPerDay } from '@/lib/receipt-upload-limit'

/** Atomically reserves one OCR processing attempt for a household, including retries, and then one of the
 *  app-wide daily attempts (a ceiling on spend that many new accounts cannot get around). */
export async function reserveReceiptOcrAttempt(householdId: string): Promise<{ allowed: true } | { allowed: false; error: string }> {
  const [row] = await getDb()
    .insert(schema.receiptOcrRateLimits)
    .values({ householdId, attempts: 1 })
    .onConflictDoUpdate({
      target: schema.receiptOcrRateLimits.householdId,
      set: {
        windowStartedAt: sql`CASE WHEN ${schema.receiptOcrRateLimits.windowStartedAt} < now() - interval '24 hours' THEN now() ELSE ${schema.receiptOcrRateLimits.windowStartedAt} END`,
        attempts: sql`CASE WHEN ${schema.receiptOcrRateLimits.windowStartedAt} < now() - interval '24 hours' THEN 1 ELSE ${schema.receiptOcrRateLimits.attempts} + 1 END`,
      },
    })
    .returning({
      attempts: schema.receiptOcrRateLimits.attempts,
      reserved: sql<boolean>`${schema.receiptOcrRateLimits.attempts} <= ${MAX_RECEIPT_UPLOADS_PER_DAY}`,
    })

  if (!row.reserved) return { allowed: false, error: RECEIPT_UPLOAD_LIMIT_MESSAGE }
  const global = await hitRateLimit('ocr:global', { max: receiptOcrGlobalPerDay(), windowMs: RECEIPT_UPLOAD_WINDOW_MS })
  if (!global.allowed) return { allowed: false, error: RECEIPT_GLOBAL_LIMIT_MESSAGE }
  return { allowed: true }
}