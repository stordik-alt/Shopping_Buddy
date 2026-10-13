'use server'

import { requireHousehold } from '@/lib/auth/authorize'
import { listAuditLog, type AuditEntry } from '@/lib/db/audit'
import { assertOwner } from '@/lib/household-members'

// The household's history of changes (lib/audit.ts). It names who changed budgets, money and members, so
// it is for the owner only; the role comes from the session (CLAUDE.md section 9).
export async function getAuditLogAction(): Promise<AuditEntry[]> {
  const { householdId, role } = await requireHousehold()
  assertOwner(role, 'Historii změn vidí jen správce domácnosti.')
  return listAuditLog(householdId, 100)
}
