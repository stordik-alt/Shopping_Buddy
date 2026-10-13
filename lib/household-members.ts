// Who may remove a member from a household. Shared by the server action (which enforces it) and the
// page data (which only decides whether to show the remove button), so the two cannot disagree.

export type MemberRole = 'owner' | 'member'

/** Settings that change the rules of the whole household (its name, monthly budget and budget period, closing a
 *  period) are for the owner. Everything an everyday member does — shopping, pantry, receipts, expenses,
 *  Kapsy, planning within the budget — stays open to every member (docs/37_SECURITY_REMEDIATION_PLAN.md, S6).
 *  The role comes from the session, never from the request. */
export function assertOwner(role: MemberRole, message: string): void {
  if (role !== 'owner') throw new Error(message)
}

/** The household's owner can never be removed this way: removing them would leave a household nobody
 *  can invite to or manage (an account belongs to one household only, so they could not come back).
 *  Otherwise the owner may remove anyone, and a member may remove only themselves or a profile that
 *  has no account (a family member added by name, who cannot act for themselves). */
export function canRemoveMember(actor: { role: MemberRole; memberId: string }, target: { id: string; role: MemberRole; userId: string | null }): boolean {
  if (target.role === 'owner') return false
  if (actor.role === 'owner') return true
  return target.id === actor.memberId || target.userId === null
}
