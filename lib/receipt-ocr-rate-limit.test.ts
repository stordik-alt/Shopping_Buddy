import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { MAX_RECEIPT_UPLOADS_PER_DAY } from '@/lib/receipt-upload-limit'
import { reserveReceiptOcrAttempt } from '@/lib/receipt-ocr-rate-limit'

describe('reserveReceiptOcrAttempt', () => {
  let householdId = ''

  // The app-wide counter is one shared row; start and leave every test with it empty so the tests do not
  // eat into each other's daily allowance.
  const clearGlobalCounter = () => getDb().delete(schema.rateLimits).where(eq(schema.rateLimits.key, 'ocr:global'))
  beforeEach(clearGlobalCounter)

  afterEach(async () => {
    vi.unstubAllEnvs()
    await clearGlobalCounter()
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

  // Security (docs/37_SECURITY_REMEDIATION_PLAN.md, V8): many new accounts each have their own household quota,
  // so the whole app has a daily ceiling as well.
  it('stops every household once the app-wide daily ceiling is reached', async () => {
    vi.stubEnv('RECEIPT_OCR_GLOBAL_PER_DAY', '2')
    const [first, second] = await getDb().insert(schema.households).values([{ name: '__test_receipt_ocr_global_a__' }, { name: '__test_receipt_ocr_global_b__' }]).returning({ id: schema.households.id })
    householdId = first.id
    try {
      expect((await reserveReceiptOcrAttempt(first.id)).allowed).toBe(true)
      expect((await reserveReceiptOcrAttempt(second.id)).allowed).toBe(true)
      const refused = await reserveReceiptOcrAttempt(first.id)
      expect(refused.allowed).toBe(false)
      expect(refused.allowed === false && refused.error).toMatch(/dočasně pozastavené/)
    } finally {
      await getDb().delete(schema.households).where(eq(schema.households.id, second.id))
    }
  })
})
