import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildReceiptLogEntry, logReceiptImport, newReceiptTrace, redactSecrets } from '@/lib/receipt-log'

afterEach(() => vi.restoreAllMocks())

describe('redactSecrets', () => {
  it('removes an API key echoed back in a request URL, keeping the rest of the message', () => {
    const message = 'request to https://vision.googleapis.com/v1/images:annotate?key=AIzaSyABCDEF123456&alt=json failed'
    const redacted = redactSecrets(message)
    expect(redacted).not.toContain('AIzaSyABCDEF123456')
    expect(redacted).toContain('images:annotate?key=[redacted]&alt=json failed')
  })

  it('removes bearer tokens and Azure subscription keys', () => {
    expect(redactSecrets('Authorization: Bearer ya29.a0AfH6SMB-token_value')).not.toContain('ya29')
    expect(redactSecrets('Ocp-Apim-Subscription-Key: 0123456789abcdef')).not.toContain('0123456789abcdef')
  })

  it('leaves an ordinary error message unchanged', () => {
    expect(redactSecrets('Google Vision request failed (403): API key not valid')).toBe('Google Vision request failed (403): API key not valid')
  })

  it('truncates very long messages so a log line stays bounded', () => {
    expect(redactSecrets('x'.repeat(5000)).length).toBe(500)
  })
})

describe('buildReceiptLogEntry', () => {
  it('starts from an all-"not_run" trace and carries the import id', () => {
    const trace = newReceiptTrace('import-1')
    expect(trace).toMatchObject({ importId: 'import-1', householdId: null, validation: 'not_run', ocr: { status: 'not_run' }, parser: { status: 'not_run' } })
  })

  it('includes the fields section 19 asks for: ids, timestamp, stage statuses, error, timing and tokens', () => {
    const trace = newReceiptTrace('import-1')
    Object.assign(trace, {
      householdId: 'household-1',
      ocr: { status: 'ok', provider: 'google_vision', ms: 420 },
      parser: { status: 'ok', ms: 900, inputTokens: 1200, outputTokens: 300 },
      validation: 'passed',
      finalStatus: 'completed',
      totalMs: 1500,
    })
    const entry = buildReceiptLogEntry(trace, new Date('2026-09-23T10:00:00.000Z'))

    expect(entry).toEqual({
      event: 'receipt_import',
      timestamp: '2026-09-23T10:00:00.000Z',
      importId: 'import-1',
      householdId: 'household-1',
      ocr: { status: 'ok', provider: 'google_vision', ms: 420 },
      imagePrep: { status: 'not_run', ms: null, steps: [], width: null, height: null, bytesBefore: null, bytesAfter: null, note: null },
      parser: { status: 'ok', ms: 900, inputTokens: 1200, outputTokens: 300 },
      validation: 'passed',
      finalStatus: 'completed',
      error: null,
      totalMs: 1500,
    })
  })

  it('redacts a secret that ends up in the image-preparation failure note too', () => {
    const trace = newReceiptTrace('import-1')
    trace.imagePrep = { ...trace.imagePrep, status: 'failed', note: 'boom https://x.example/?key=SECRETNOTE123' }
    expect(JSON.stringify(buildReceiptLogEntry(trace))).not.toContain('SECRETNOTE123')
  })

  it('redacts secrets in the error but never adds receipt content', () => {
    const trace = { ...newReceiptTrace('import-1'), error: 'fetch failed: https://vision.googleapis.com/v1/images:annotate?key=SECRET123' }
    const serialized = JSON.stringify(buildReceiptLogEntry(trace))
    expect(serialized).not.toContain('SECRET123')
    expect(Object.keys(buildReceiptLogEntry(trace))).not.toContain('rawOcrText')
  })
})

describe('logReceiptImport', () => {
  it('writes one JSON line via console.info for a normal outcome', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    logReceiptImport({ ...newReceiptTrace('import-1'), finalStatus: 'review_required' })
    expect(info).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
    expect(JSON.parse(String(info.mock.calls[0][0])).event).toBe('receipt_import')
  })

  it.each(['ocr_failed', 'parsing_failed', 'threw'])('uses console.error for %s so failures stand out', (finalStatus) => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    logReceiptImport({ ...newReceiptTrace('import-1'), finalStatus })
    expect(error).toHaveBeenCalledTimes(1)
    expect(info).not.toHaveBeenCalled()
  })
})
