import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { MAX_RECEIPT_UPLOADS_PER_DAY } from '@/lib/receipt-upload-limit'
import { reserveReceiptOcrAttempt } from '@/lib/receipt-ocr-rate-limit'

describe('reserveReceiptOcrAttempt', () => {
  let householdId = ''

  afterEach(async () => {
    if (!householdId) return
    await getDb().delete(schema.households).where(eq(schema.households.id, householdId))
    householdId = ''
  })

  it('counts repeated OCR attempts, including retries, and blocks the 31st attempt', async () => {
    const [household] = await getDb().insert(schema.households).values({ name: '__test_receipt_ocr_rate_limit__' }).returning({ id: schema.households.id })
    householdId = household.id

    for (let attempt = 1; attempt <= MAX_RECEIPT_UPLOADS_PER_DAY; attempt += 1) {
      expect((await reserveReceiptOcrAttempt(householdId)).allowed).toBe(true)
    }
    expect((await reserveReceiptOcrAttempt(householdId)).allowed).toBe(false)
  })

  it('starts a new window after the previous 24-hour window expires', async () => {
    const [household] = await getDb().insert(schema.households).values({ name: '__test_receipt_ocr_rate_limit_reset__' }).returning({ id: schema.households.id })
    householdId = household.id
    await getDb().insert(schema.receiptOcrRateLimits).values({ householdId, attempts: MAX_RECEIPT_UPLOADS_PER_DAY })
    await getDb().update(schema.receiptOcrRateLimits).set({ windowStartedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }).where(eq(schema.receiptOcrRateLimits.householdId, householdId))

    expect((await reserveReceiptOcrAttempt(householdId)).allowed).toBe(true)
  })
})