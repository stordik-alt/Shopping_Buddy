'use server'

import { ACCOUNT_DELETION_BLOCKED_MESSAGE, confirmsEmail, planAccountDeletion } from '@/lib/account-deletion'
import { requireHousehold } from '@/lib/auth/authorize'
import { countOtherAccounts, deleteHouseholdData, removeMemberAccountData } from '@/lib/db/account-deletion'
import { hitRateLimit } from '@/lib/db/rate-limit'

// Deleting one's own account (docs/37_SECURITY_REMEDIATION_PLAN.md, S2). This removes the person's
// data from the application database; the login account in Neon Auth is deleted by the browser right
// after (authClient.deleteUser), because the auth service only lets a signed-in session do it. If that
// second step fails the data is already gone, which is what was asked for, and the person can retry.
// Who is deleted comes from the session, never from the request; the typed e-mail only guards against
// an accidental tap.

export type DeleteAccountResult = { householdDeleted: boolean }

export async function deleteAccountDataAction(typedEmail: string): Promise<DeleteAccountResult> {
  const { userId, userEmail, householdId, memberId, role } = await requireHousehold()
  if (!confirmsEmail(typedEmail, userEmail)) throw new Error('Zadaný e-mail neodpovídá vašemu účtu.')
  // A handful of tries is plenty for a one-off action and keeps a stuck client from hammering it.
  if (!(await hitRateLimit(`delete-account:${userId}`, { max: 5, windowMs: 600_000 })).allowed) throw new Error('Příliš mnoho pokusů, zkuste to za chvíli.')

  const plan = planAccountDeletion(role, await countOtherAccounts(householdId, memberId))
  if (plan === 'blocked') throw new Error(ACCOUNT_DELETION_BLOCKED_MESSAGE)
  if (plan === 'leave') {
    await removeMemberAccountData(householdId, memberId, userEmail)
    return { householdDeleted: false }
  }
  await deleteHouseholdData(householdId)
  return { householdDeleted: true }
}
