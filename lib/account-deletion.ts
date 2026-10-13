import type { MemberRole } from '@/lib/household-members'

// What deleting an account means for the household it belongs to (docs/37_SECURITY_REMEDIATION_PLAN.md,
// S2). Pure, so the server action and the confirmation dialog cannot disagree.
//
//   leave        a member (not the owner) deletes their account: their profile and everything personal
//                to it go, the household and its shared data stay for the others.
//   delete       the owner whose household has no other account in it: the household goes with them
//                (profiles without an account, such as children, belong to nobody else).
//   blocked      the owner while other accounts are still in the household: the app has no way to hand
//                ownership over, and deleting the household would take the others' data without asking.
//                The owner removes the other members first.
export type AccountDeletionPlan = 'leave' | 'delete' | 'blocked'

export function planAccountDeletion(role: MemberRole, otherAccounts: number): AccountDeletionPlan {
  if (role !== 'owner') return 'leave'
  return otherAccounts > 0 ? 'blocked' : 'delete'
}

export const ACCOUNT_DELETION_BLOCKED_MESSAGE =
  'Domácnost má další členy s účtem. Nejdřív je odeberte v Profilu domácnosti, pak půjde účet smazat i s domácností.'

/** The e-mail typed to confirm must be the signed-in account's own (case does not matter). */
export function confirmsEmail(typed: string, accountEmail: string): boolean {
  return typed.trim().toLowerCase() === accountEmail.trim().toLowerCase() && accountEmail.trim() !== ''
}
