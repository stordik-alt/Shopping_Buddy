import { confirmsEmail, planAccountDeletion, ACCOUNT_DELETION_BLOCKED_MESSAGE } from '@/lib/account-deletion'
import { countOtherAccounts, deleteHouseholdData, removeMemberAccountData } from '@/lib/db/account-deletion'
import { hitRateLimit } from '@/lib/db/rate-limit'
import type { MemberRole } from '@/lib/household-members'

export class AccountDeletionError extends Error {
  constructor(message: string, readonly status: 400 | 409 | 429) {
    super(message)
  }
}

export type AccountDeletionResult = { householdDeleted: boolean; photosFailed: number }

/** Shared account deletion rules for the PWA server action and the authenticated Expo API. */
export async function deleteAccountDataForUser(input: {
  typedEmail: string
  userId: string
  userEmail: string
  householdId: string
  memberId: string
  role: MemberRole
}): Promise<AccountDeletionResult> {
  if (!confirmsEmail(input.typedEmail, input.userEmail)) {
    throw new AccountDeletionError('Zadaný e-mail neodpovídá vašemu účtu.', 400)
  }

  const rate = await hitRateLimit(`delete-account:${input.userId}`, { max: 5, windowMs: 600_000 })
  if (!rate.allowed) throw new AccountDeletionError('Příliš mnoho pokusů, zkuste to za chvíli.', 429)

  const plan = planAccountDeletion(input.role, await countOtherAccounts(input.householdId, input.memberId))
  if (plan === 'blocked') throw new AccountDeletionError(ACCOUNT_DELETION_BLOCKED_MESSAGE, 409)
  if (plan === 'leave') {
    await removeMemberAccountData(input.householdId, input.memberId, input.userEmail)
    return { householdDeleted: false, photosFailed: 0 }
  }

  const result = await deleteHouseholdData(input.householdId)
  return { householdDeleted: true, photosFailed: result.photosFailed }
}
