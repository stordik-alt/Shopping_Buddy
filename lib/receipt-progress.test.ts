import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import {
  RECEIPT_PROGRESS_STATUSES,
  RECEIPT_STALE_MS,
  RECEIPT_STEPS,
  RECEIPT_UNSTARTED_STALE_MS,
  isReceiptStalled,
  pollReceiptStatus,
  receiptProgress,
} from '@/lib/receipt-progress'

describe('receiptProgress', () => {
  it('has the five stages the pipeline doc names, in order', () => {
    expect(RECEIPT_STEPS).toEqual(['Nahrávání', 'Čtení účtenky', 'Rozpoznávání položek', 'Kontrola údajů', 'Hotovo'])
  })

  it('walks forward through the stages as the import status advances', () => {
    const steps = ['uploading', 'uploaded', 'ocr_processing', 'ocr_completed', 'parsing', 'parsed', 'validating', 'completed'].map((status) => receiptProgress(status).step)
    expect(steps).toEqual([0, 1, 1, 2, 2, 3, 3, 4])
    expect([...steps].sort((a, b) => a - b)).toEqual(steps) // never goes backwards
  })

  it('marks the stage that failed rather than moving on', () => {
    expect(receiptProgress('ocr_failed')).toEqual({ step: 1, failed: true })
    expect(receiptProgress('parsing_failed')).toEqual({ step: 2, failed: true })
  })

  it('treats states that wait on a person as finished automatic processing', () => {
    expect(receiptProgress('review_required')).toEqual({ step: 4, failed: false })
    expect(receiptProgress('duplicate_review')).toEqual({ step: 4, failed: false })
  })

  it('maps every pipeline status in the database enum, so adding one without updating the map fails here', () => {
    // 'pending_review' / 'discarded' are the legacy manual-entry states and never reach this UI;
    // 'uploading' is the client-side phase before a row exists.
    const legacy = ['pending_review', 'discarded']
    const expected = [...schema.receiptStatusEnum.enumValues.filter((status) => !legacy.includes(status)), 'uploading']
    expect([...RECEIPT_PROGRESS_STATUSES].sort()).toEqual(expected.sort())
  })

  it('falls back to the first stage for an unknown status instead of throwing', () => {
    expect(receiptProgress('something_new')).toEqual({ step: 0, failed: false })
  })
})

describe('isReceiptStalled', () => {
  const now = Date.parse('2026-09-23T12:00:00Z')
  const ago = (ms: number) => new Date(now - ms)

  it('offers a never-started upload after a short wait', () => {
    expect(isReceiptStalled('uploaded', ago(RECEIPT_UNSTARTED_STALE_MS - 1000), now)).toBe(false)
    expect(isReceiptStalled('uploaded', ago(RECEIPT_UNSTARTED_STALE_MS + 1000), now)).toBe(true)
  })

  it('gives an in-flight run much longer before calling it abandoned', () => {
    expect(isReceiptStalled('ocr_processing', ago(RECEIPT_STALE_MS - 1000), now)).toBe(false)
    expect(isReceiptStalled('parsing', ago(RECEIPT_STALE_MS + 1000), now)).toBe(true)
  })

  it('never calls failed or waiting-for-a-person states stalled — they have their own actions', () => {
    for (const status of ['ocr_failed', 'parsing_failed', 'review_required', 'duplicate_review', 'completed']) {
      expect(isReceiptStalled(status, ago(24 * 60 * 60 * 1000), now), status).toBe(false)
    }
  })
})

describe('pollReceiptStatus', () => {
  const statusResponse = (status: string) => new Response(JSON.stringify({ status }), { status: 200 })
  const fetchFn = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.useFakeTimers()
    fetchFn.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('reports only status changes, polling the status route of the given import', async () => {
    fetchFn
      .mockResolvedValueOnce(statusResponse('ocr_processing'))
      .mockResolvedValueOnce(statusResponse('ocr_processing'))
      .mockResolvedValueOnce(statusResponse('parsing'))
    const seen: string[] = []
    const stop = pollReceiptStatus('abc', (status) => seen.push(status), { intervalMs: 1000, fetchFn })

    await vi.advanceTimersByTimeAsync(3100)
    stop()

    expect(seen).toEqual(['ocr_processing', 'parsing'])
    expect(String(fetchFn.mock.calls[0][0])).toBe('/api/receipts/abc/status')
  })

  it('ignores a failed poll (network error or non-OK) and keeps going', async () => {
    fetchFn
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(statusResponse('validating'))
    const seen: string[] = []
    const stop = pollReceiptStatus('abc', (status) => seen.push(status), { intervalMs: 1000, fetchFn })

    await vi.advanceTimersByTimeAsync(3100)
    stop()

    expect(seen).toEqual(['validating'])
  })

  it('stops polling and reports nothing further once stopped', async () => {
    fetchFn.mockResolvedValue(statusResponse('parsing'))
    const seen: string[] = []
    const stop = pollReceiptStatus('abc', (status) => seen.push(status), { intervalMs: 1000, fetchFn })

    await vi.advanceTimersByTimeAsync(1100)
    stop()
    const callsAtStop = fetchFn.mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)

    expect(fetchFn.mock.calls.length).toBe(callsAtStop)
    expect(seen).toEqual(['parsing'])
  })

  it('never has two requests in flight at once', async () => {
    let inFlight = 0
    let maxInFlight = 0
    fetchFn.mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 2500)) // slower than the polling interval
      inFlight -= 1
      return statusResponse('parsing')
    })
    const stop = pollReceiptStatus('abc', () => {}, { intervalMs: 1000, fetchFn })

    await vi.advanceTimersByTimeAsync(12_000)
    stop()

    expect(maxInFlight).toBe(1)
  })
})
