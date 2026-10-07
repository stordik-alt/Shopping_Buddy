import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { MAX_RECEIPT_UPLOADS_PER_DAY, RECEIPT_UPLOAD_LIMIT_MESSAGE } from '@/lib/receipt-upload-limit'

/** Atomically reserves one OCR processing attempt for a household, including retries. */
export async function reserveReceiptOcrAttempt(householdId: string): Promise<{ allowed: true } | { allowed: false; error: string }> {
  const [row] = await getDb()
    .insert(schema.receiptOcrRateLimits)
    .values({ householdId, attempts: 1 })
    .onConflictDoUpdate({
      target: schema.receiptOcrRateLimits.householdId,
      set: {
        windowStartedAt: sql`CASE WHEN ${schema.receiptOcrRateLimits.windowStartedAt} < now() - interval '24 hours' THEN now() ELSE ${schema.receiptOcrRateLimits.windowStartedAt} END`,
        attempts: sql`CASE WHEN ${schema.receiptOcrRateLimits.windowStartedAt} < now() - interval '24 hours' THEN 1 WHEN ${schema.receiptOcrRateLimits.attempts} < ${MAX_RECEIPT_UPLOADS_PER_DAY} THEN ${schema.receiptOcrRateLimits.attempts} + 1 ELSE ${schema.receiptOcrRateLimits.attempts} END`,
      },
    })
    .returning({ attempts: schema.receiptOcrRateLimits.attempts })

  if (row.attempts > MAX_RECEIPT_UPLOADS_PER_DAY) return { allowed: false, error: RECEIPT_UPLOAD_LIMIT_MESSAGE }
  return { allowed: true }
}