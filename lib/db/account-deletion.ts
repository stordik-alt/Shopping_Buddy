import { and, eq, isNotNull, ne, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { deleteReceiptFile } from '@/lib/storage'

// The database side of deleting an account (docs/37_SECURITY_REMEDIATION_PLAN.md, S2). The login
// account itself lives in Neon Auth and is deleted by the client afterwards (authClient.deleteUser);
// its foreign key from household_members is ON DELETE SET NULL, so the order cannot orphan anything.

/** How many other accounts (members with a login) share this household. */
export async function countOtherAccounts(householdId: string, memberId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.householdMembers)
    .where(and(eq(schema.householdMembers.householdId, householdId), ne(schema.householdMembers.id, memberId), isNotNull(schema.householdMembers.userId)))
  return row?.count ?? 0
}

/** A member leaves: their member row goes (and with it everything keyed to it — store choices, push
 *  subscriptions, notification settings), plus the invitations addressed to their e-mail. Shared
 *  household data (lists, purchases, receipts) stays with the household. */
export async function removeMemberAccountData(householdId: string, memberId: string, email: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.delete(schema.invitations).where(and(eq(schema.invitations.householdId, householdId), sql`lower(${schema.invitations.email}) = lower(${email})`))
    await tx.delete(schema.householdMembers).where(and(eq(schema.householdMembers.id, memberId), eq(schema.householdMembers.householdId, householdId)))
  })
}

/** The last account of a household goes: the household row and, through the foreign keys, everything
 *  of it. The receipt photos in R2 are not covered by a foreign key, so they are deleted too — after the
 *  rows, and a failed delete is logged rather than undoing the deletion the person asked for. Returns how
 *  many photos could not be removed. */
export async function deleteHouseholdData(householdId: string): Promise<{ photosFailed: number }> {
  const db = getDb()
  const photos = await db.select({ imageUrl: schema.receiptImports.imageUrl }).from(schema.receiptImports).where(eq(schema.receiptImports.householdId, householdId))
  await db.delete(schema.households).where(eq(schema.households.id, householdId))

  let photosFailed = 0
  for (const { imageUrl } of photos) {
    if (!imageUrl) continue
    try {
      await deleteReceiptFile(imageUrl)
    } catch (error) {
      photosFailed += 1
      // Only the kind of failure: the reference holds the household id and must not reach a log with a stack of SQL.
      console.error('account_deletion_photo_failed', error instanceof Error ? error.name : 'unknown')
    }
  }
  return { photosFailed }
}
