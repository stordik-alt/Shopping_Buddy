// Progress display for a receipt photo import (docs/08_OCR_RECEIPT_PIPELINE.md section 20). Kept
// free of server-only imports so client components can use it.

export const RECEIPT_STEPS = ['Nahrávání', 'Čtení účtenky', 'Rozpoznávání položek', 'Kontrola údajů', 'Hotovo'] as const

/** The pipeline states a run passes through before it needs a person, plus the client-side
 *  'uploading' phase that exists before any row does. */
export type ReceiptProgressStatus = string

export type ReceiptProgress = {
  /** Index into RECEIPT_STEPS of the step currently running (or the last step when finished). */
  step: number
  /** True when the run stopped at `step` because that stage failed. */
  failed: boolean
}

/** How long a non-final import may sit unchanged before it is considered abandoned (e.g. the
 *  function was killed mid-run) and offered for re-processing. A freshly uploaded import that was
 *  never started (the browser closed between upload and processing) is offered much sooner. */
export const RECEIPT_STALE_MS = 10 * 60 * 1000
export const RECEIPT_UNSTARTED_STALE_MS = 30 * 1000

const IN_FLIGHT = new Set(['ocr_processing', 'ocr_completed', 'parsing', 'parsed', 'validating'])

/** Whether a non-final import looks abandoned rather than actively running, so the UI should offer
 *  to (re)start it. Failed and waiting-for-a-person states are never "stalled" — they have their
 *  own actions. `now` is injectable for tests. */
export function isReceiptStalled(status: string, updatedAt: Date, now: number = Date.now()): boolean {
  const age = now - updatedAt.getTime()
  if (status === 'uploaded') return age > RECEIPT_UNSTARTED_STALE_MS
  if (IN_FLIGHT.has(status)) return age > RECEIPT_STALE_MS
  return false
}

const STEP_BY_STATUS: Record<string, ReceiptProgress> = {
  uploading: { step: 0, failed: false },
  // Uploaded and stored; the reading stage is next/starting.
  uploaded: { step: 1, failed: false },
  ocr_processing: { step: 1, failed: false },
  ocr_failed: { step: 1, failed: true },
  ocr_completed: { step: 2, failed: false },
  parsing: { step: 2, failed: false },
  parsing_failed: { step: 2, failed: true },
  parsed: { step: 3, failed: false },
  validating: { step: 3, failed: false },
  // Every state below means the automatic part is over: either finished, or waiting on the person
  // (review/duplicate cards take over from here).
  completed: { step: 4, failed: false },
  review_required: { step: 4, failed: false },
  duplicate_review: { step: 4, failed: false },
  imported: { step: 4, failed: false },
  cancelled: { step: 4, failed: false },
}

/** Statuses with an explicit step (everything except the legacy manual-entry states). */
export const RECEIPT_PROGRESS_STATUSES: readonly string[] = Object.keys(STEP_BY_STATUS)

/** Maps an import's status to the step shown to the user. An unrecognised status maps to the first
 *  step rather than throwing, so a status added later never breaks the upload panel. */
export function receiptProgress(status: ReceiptProgressStatus): ReceiptProgress {
  return STEP_BY_STATUS[status] ?? { step: 0, failed: false }
}

/** Polls the status route and reports each *change* until stopped. Requests never overlap (the
 *  next one is scheduled only after the previous settled), and a failed poll is ignored: progress
 *  display is best-effort and must never fail the import itself. `fetchFn` is injectable for tests. */
export function pollReceiptStatus(
  importId: string,
  onStatus: (status: string) => void,
  options: { intervalMs?: number; fetchFn?: typeof fetch } = {},
): () => void {
  const intervalMs = options.intervalMs ?? 1000
  const fetchFn = options.fetchFn ?? fetch
  let stopped = false
  let lastStatus: string | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  async function tick() {
    try {
      const response = await fetchFn(`/api/receipts/${importId}/status`, { cache: 'no-store' })
      if (response.ok) {
        const body = (await response.json()) as { status?: string }
        if (!stopped && body.status && body.status !== lastStatus) {
          lastStatus = body.status
          onStatus(body.status)
        }
      }
    } catch {
      // Best-effort: a dropped poll only means the display lags until the next one.
    }
    if (!stopped) timer = setTimeout(tick, intervalMs)
  }

  timer = setTimeout(tick, intervalMs)
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}
