import { describe, expect, it } from 'vitest'
import { MAX_RECEIPT_UPLOADS_PER_DAY, mayUploadReceipt, RECEIPT_UPLOAD_LIMIT_MESSAGE } from './receipt-upload-limit'

describe('mayUploadReceipt', () => {
  it('allows uploads below the daily cap', () => {
    expect(mayUploadReceipt(0)).toBe(true)
    expect(mayUploadReceipt(MAX_RECEIPT_UPLOADS_PER_DAY - 1)).toBe(true)
  })

  it('refuses once the cap is reached or exceeded', () => {
    expect(mayUploadReceipt(MAX_RECEIPT_UPLOADS_PER_DAY)).toBe(false)
    expect(mayUploadReceipt(MAX_RECEIPT_UPLOADS_PER_DAY + 5)).toBe(false)
  })

  it('names the cap in the message shown to the user', () => {
    expect(RECEIPT_UPLOAD_LIMIT_MESSAGE).toContain(String(MAX_RECEIPT_UPLOADS_PER_DAY))
  })
})
