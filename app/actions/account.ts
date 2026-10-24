'use server'

import { requireHousehold } from '@/lib/auth/authorize'
import { deleteAccountDataForUser } from '@/lib/account-deletion-service'

// Deleting one's own account (docs/37_SECURITY_REMEDIATION_PLAN.md, S2). This removes the person's
// data from the application database; the login account in Neon Auth is deleted by the browser right
// after (authClient.deleteUser), because the auth service only lets a signed-in session do it. If that
// second step fails the data is already gone, which is what was asked for, and the person can retry.
// Who is deleted comes from the session, never from the request; the typed e-mail only guards against
// an accidental tap.

export type DeleteAccountResult = { householdDeleted: boolean }

export async function deleteAccountDataAction(typedEmail: string): Promise<DeleteAccountResult> {
  const { userId, userEmail, householdId, memberId, role } = await requireHousehold()
  const result = await deleteAccountDataForUser({ typedEmail, userId, userEmail, householdId, memberId, role })
  return { householdDeleted: result.householdDeleted }
}
