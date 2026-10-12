// How many receipt photos a household may upload per rolling 24 hours. Every upload can end in a
// paid OCR call (Google Vision / Azure) and a model call, so an unlimited endpoint lets one bug, one
// stuck client retry loop or one abusive account spend the whole monthly credit. The cap is far
// above real use (a household shops a few times a week) and only ever stops runaway volume.

export const MAX_RECEIPT_UPLOADS_PER_DAY = 30

/** How many receipts all households together may have read (OCR and model) per rolling 24 hours. Every
 *  household has its own cap above, but accounts are cheap to create, so the per-household caps alone do not
 *  bound the monthly spend; this is the ceiling for the whole app. Far above real use; `RECEIPT_OCR_GLOBAL_PER_DAY`
 *  in the environment overrides it. */
export const DEFAULT_RECEIPT_OCR_GLOBAL_PER_DAY = 400

export function receiptOcrGlobalPerDay(env: Record<string, string | undefined> = process.env): number {
  const configured = Number(env.RECEIPT_OCR_GLOBAL_PER_DAY)
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_RECEIPT_OCR_GLOBAL_PER_DAY
}

export const RECEIPT_GLOBAL_LIMIT_MESSAGE = 'Čtení účtenek je dnes dočasně pozastavené, protože služba dosáhla denního limitu. Zkuste to zítra, nebo účtenku zadejte ručně.'

/** The window the count covers, in milliseconds (a rolling day, not the calendar day, so the limit
 *  cannot be doubled by uploading either side of midnight). */
export const RECEIPT_UPLOAD_WINDOW_MS = 24 * 60 * 60 * 1000

/** Whether a household that has already uploaded `uploadsInWindow` receipts in the window may
 *  upload another. Pure, so the rule is testable without a database. */
export function mayUploadReceipt(uploadsInWindow: number): boolean {
  return uploadsInWindow < MAX_RECEIPT_UPLOADS_PER_DAY
}

/** The message shown when the limit is reached: says what happened and what to do instead. */
export const RECEIPT_UPLOAD_LIMIT_MESSAGE = `Dnes jste nahráli maximum účtenek (${MAX_RECEIPT_UPLOADS_PER_DAY} za 24 hodin). Zkuste to později, nebo účtenku zadejte ručně.`
