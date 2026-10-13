'use server'

import { eq } from 'drizzle-orm'
import { requireHousehold } from '@/lib/auth/authorize'
import { confirmsHouseholdName, DATA_RESET_LABELS, normalizeResetGroups } from '@/lib/data-reset'
import { recordAudit } from '@/lib/db/audit'
import { getDb } from '@/lib/db/client'
import { resetHouseholdData } from '@/lib/db/data-reset'
import { hitRateLimit } from '@/lib/db/rate-limit'
import * as schema from '@/lib/db/schema'
import { assertOwner } from '@/lib/household-members'

// "Smazání dat" in the Profile (docs/39_DATA_RESET.md): the owner wipes the chosen user data and keeps the
// profile. Who and which household come from the session, never from the request; the typed household
// name is checked here, not in the browser, so the dialog is a convenience and not the safeguard.
export async function resetHouseholdDataAction(groups: string[], typedName: string): Promise<{ photosFailed: number }> {
  const { userId, householdId, memberId, role } = await requireHousehold()
  assertOwner(role, 'Data domácnosti smí smazat jen správce domácnosti.')
  const chosen = normalizeResetGroups(groups)
  if (chosen.length === 0) throw new Error('Vyberte, co chcete smazat.')
  const household = await getDb().query.households.findFirst({ where: eq(schema.households.id, householdId), columns: { name: true } })
  if (!household || !confirmsHouseholdName(typedName, household.name)) throw new Error('Zadaný název neodpovídá názvu domácnosti.')
  // A one-off action: a handful of tries keeps a stuck client from hammering it.
  if (!(await hitRateLimit(`reset-data:${userId}`, { max: 5, windowMs: 600_000 })).allowed) throw new Error('Příliš mnoho pokusů, zkuste to za chvíli.')

  const result = await resetHouseholdData(householdId, chosen)
  await recordAudit({ householdId, memberId }, 'data.reset', { groups: chosen.map((group) => DATA_RESET_LABELS[group].title).join(', ') })
  return result
}
