// Structured, per-import log line for the receipt OCR pipeline (docs/08_OCR_RECEIPT_PIPELINE.md
// section 19): one JSON line per pipeline run, so a household's "my receipt failed" can be traced
// to the stage, provider and timing that caused it in the platform's log viewer.
//
// Deliberately NOT logged: the OCR text and item data (personal financial information) and any
// credential. Error messages from upstream services are passed through `redactSecrets()` first,
// because a failing HTTP client can echo the request URL (which carries the Vision API key).

import { redactSecrets } from '@/lib/redact'

export type ReceiptStageStatus = 'ok' | 'failed' | 'not_run'

export type ReceiptTrace = {
  importId: string
  /** Null only when the import row could not be loaded at all. */
  householdId: string | null
  /** `note` says why the primary route was not used: the PDF had no text layer, or the primary OCR
   *  failed and a fallback read the file instead (redacted, never the text itself). */
  ocr: { status: ReceiptStageStatus; provider: string | null; ms: number | null; note?: string | null }
  /** Best-effort photo preparation before reading (lib/receipt-image.ts): which steps ran and what
   *  it did to image size. `failed` means the original was sent instead; `not_run` covers PDFs. */
  imagePrep: {
    status: ReceiptStageStatus
    ms: number | null
    steps: string[]
    width: number | null
    height: number | null
    bytesBefore: number | null
    bytesAfter: number | null
    note: string | null
  }
  parser: { status: ReceiptStageStatus; ms: number | null; inputTokens: number | null; outputTokens: number | null }
  /** Outcome of the validation gates (consistency, required fields, placement, duplicate check). */
  validation: 'passed' | 'review_required' | 'duplicate_review' | 'not_run'
  /** The `receipt_imports.status` the run ended in, or 'threw' if the pipeline itself threw. */
  finalStatus: string
  error: string | null
  totalMs: number | null
}

export function newReceiptTrace(importId: string): ReceiptTrace {
  return {
    importId,
    householdId: null,
    ocr: { status: 'not_run', provider: null, ms: null },
    imagePrep: { status: 'not_run', ms: null, steps: [], width: null, height: null, bytesBefore: null, bytesAfter: null, note: null },
    parser: { status: 'not_run', ms: null, inputTokens: null, outputTokens: null },
    validation: 'not_run',
    finalStatus: 'unknown',
    error: null,
    totalMs: null,
  }
}

// Re-exported: the implementation lives in lib/redact.ts so the cron routes and actions use the same one.
export { redactSecrets } from '@/lib/redact'

export function buildReceiptLogEntry(trace: ReceiptTrace, now: Date = new Date()) {
  return {
    event: 'receipt_import',
    timestamp: now.toISOString(),
    ...trace,
    imagePrep: { ...trace.imagePrep, note: trace.imagePrep.note == null ? null : redactSecrets(trace.imagePrep.note) },
    error: trace.error == null ? null : redactSecrets(trace.error),
  }
}

/** Writes the trace as a single JSON line. Failures use `console.error` so they stand out. */
export function logReceiptImport(trace: ReceiptTrace): void {
  const entry = buildReceiptLogEntry(trace)
  const line = JSON.stringify(entry)
  if (trace.finalStatus === 'ocr_failed' || trace.finalStatus === 'parsing_failed' || trace.finalStatus === 'threw') {
    console.error(line)
  } else {
    console.info(line)
  }
}
