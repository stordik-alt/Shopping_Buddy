import { and, inArray, isNotNull, lt, or, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { purgeStaleRateLimits } from '@/lib/db/rate-limit'
import { AUDIT_LOG_DAYS, FINISHED_RECEIPT_STATUSES, INVITATION_AFTER_EXPIRY_DAYS, RECEIPT_RAW_TEXT_DAYS } from '@/lib/retention'

// Time-limited retention of personal data (docs/37_SECURITY_REMEDIATION_PLAN.md, S2). Run weekly by
// app/api/cron/retention. Each step is idempotent, so a repeated or interrupted run is harmless.

export type RetentionResult = { receiptsCleared: number; invitationsDeleted: number; auditEntriesDeleted: number }

export async function applyRetention(): Promise<RetentionResult> {
  const db = getDb()

  // Raw OCR text and parser JSON of finished receipts. The row, its confirmed items and the photo stay.
  const cleared = await db
    .update(schema.receiptImports)
    .set({ rawOcrText: null, parserResult: null })
    .where(
      and(
        inArray(schema.receiptImports.status, [...FINISHED_RECEIPT_STATUSES]),
        lt(schema.receiptImports.updatedAt, sql`now() - make_interval(days => ${RECEIPT_RAW_TEXT_DAYS})`),
        or(isNotNull(schema.receiptImports.rawOcrText), isNotNull(schema.receiptImports.parserResult)),
      ),
    )
    .returning({ id: schema.receiptImports.id })

  const deleted = await db
    .delete(schema.invitations)
    .where(lt(schema.invitations.expiresAt, sql`now() - make_interval(days => ${INVITATION_AFTER_EXPIRY_DAYS})`))
    .returning({ id: schema.invitations.id })

  const audit = await db
    .delete(schema.auditLog)
    .where(lt(schema.auditLog.createdAt, sql`now() - make_interval(days => ${AUDIT_LOG_DAYS})`))
    .returning({ id: schema.auditLog.id })

  await purgeStaleRateLimits()
  return { receiptsCleared: cleared.length, invitationsDeleted: deleted.length, auditEntriesDeleted: audit.length }
}
