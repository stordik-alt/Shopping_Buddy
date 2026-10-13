// How long personal data is kept after it stopped being needed (docs/37_SECURITY_REMEDIATION_PLAN.md,
// S2). Constants live apart from the SQL so the policy is one readable place, and the cron route, the
// tests and the documentation all name the same numbers.

/** Raw OCR text and the raw parser JSON of a receipt that is finished (imported, discarded, failed,
 *  cancelled). They hold everything printed on the receipt, including the shop's cashier or card
 *  details, and are only for debugging a parser; the confirmed line items stay. Days since last update. */
export const RECEIPT_RAW_TEXT_DAYS = 90

/** A household invitation holds the invited person's e-mail. Kept this many days after it expired, so
 *  the owner still sees recent ones, then deleted. */
export const INVITATION_AFTER_EXPIRY_DAYS = 30

/** Receipt statuses where nothing will read the raw text again. A receipt still waiting for a person
 *  ('pending_review', 'review_required', 'duplicate_review') or in the middle of the pipeline keeps it:
 *  the review screen shows it. */
export const FINISHED_RECEIPT_STATUSES = ['imported', 'discarded', 'completed', 'cancelled', 'ocr_failed', 'parsing_failed'] as const

/** The audit trail (lib/db/audit.ts) of a household: a year of history is enough to find who changed a
 *  budget, and it must not grow without end. Days since the entry was written. */
export const AUDIT_LOG_DAYS = 365
