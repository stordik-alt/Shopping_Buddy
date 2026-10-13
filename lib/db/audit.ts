import { desc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { AuditAction, AuditDetail } from '@/lib/audit'
import { safeErrorMessage } from '@/lib/errors'

// Writes and reads the household audit trail (lib/audit.ts has the vocabulary).

/** Records one change. Called after the change succeeded. The Neon HTTP driver cannot put it in the same
 *  transaction as the change, so a failed write is logged and does not undo or block what the person did —
 *  a missing line in the history is the lesser harm. Nothing but amounts and field names goes in `detail`. */
export async function recordAudit(
  actor: { householdId: string; memberId?: string },
  action: AuditAction,
  detail: AuditDetail = {},
  entityId?: string,
): Promise<void> {
  try {
    await getDb().insert(schema.auditLog).values({ householdId: actor.householdId, actorMemberId: actor.memberId ?? null, action, entityId: entityId ?? null, detail })
  } catch (error) {
    console.error('[audit] could not record', action, safeErrorMessage(error))
  }
}

export type AuditEntry = { id: string; action: string; actor: string | null; detail: AuditDetail; createdAt: string }

/** The newest entries of a household, with the actor's name while that member still exists. */
export async function listAuditLog(householdId: string, limit = 100): Promise<AuditEntry[]> {
  const rows = await getDb().query.auditLog.findMany({
    where: eq(schema.auditLog.householdId, householdId),
    orderBy: desc(schema.auditLog.createdAt),
    limit,
    with: { actor: { columns: { name: true } } },
  })
  return rows.map((row) => ({ id: row.id, action: row.action, actor: row.actor?.name ?? null, detail: row.detail, createdAt: row.createdAt.toISOString() }))
}
