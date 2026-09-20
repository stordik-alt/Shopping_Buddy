import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

export class ForbiddenError extends Error {}

/** Resolves the signed-in user's session, household id, and role in one lookup. Server Actions
 *  call this first and use the result instead of trusting client-supplied ids — closes the IDOR
 *  gap where a request could otherwise read/write another household's data by passing its id. */
export async function requireHousehold(): Promise<{ userId: string; userEmail: string; householdId: string; role: 'owner' | 'member' }> {
  const { data: session } = await auth.getSession()
  if (!session?.user) throw new ForbiddenError('Not signed in')
  const db = getDb()
  const member = await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.userId, session.user.id) })
  if (!member) throw new ForbiddenError('No household for this account')
  return { userId: session.user.id, userEmail: session.user.email, householdId: member.householdId, role: member.role }
}

/** Convenience wrapper for the common case where only the household id is needed. */
export async function requireHouseholdId(): Promise<string> {
  return (await requireHousehold()).householdId
}
