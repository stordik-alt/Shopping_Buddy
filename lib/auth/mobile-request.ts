import { eq } from 'drizzle-orm'
import { BearerAuthError, bearerTokenFrom, requireBearerUser, type BearerUser } from '@/lib/auth/bearer'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

export class MobileRequestAuthError extends Error {
  constructor(
    readonly code: string,
    readonly status: 401 | 403,
  ) {
    super(code)
  }
}

export async function mobileUserFromRequest(request: Request): Promise<BearerUser> {
  if (bearerTokenFrom(request.headers) !== null || request.headers.has('authorization')) {
    try {
      return await requireBearerUser(request.headers)
    } catch (error) {
      if (!(error instanceof BearerAuthError)) throw error
      if (error.reason === 'unverified_email') throw new MobileRequestAuthError('email_not_verified', 403)
      if (error.reason === 'unavailable') throw new MobileRequestAuthError('bearer_unavailable', 401)
      throw new MobileRequestAuthError('invalid_token', 401)
    }
  }

  const { auth } = await import('@/lib/auth/server')
  const { data: session } = await auth.getSession()
  if (!session?.user) throw new MobileRequestAuthError('not_signed_in', 401)
  const { id, email, name, emailVerified } = session.user
  return { id, email, name, emailVerified: emailVerified === true }
}

export async function mobileHouseholdForUser(userId: string) {
  return getDb().query.householdMembers.findFirst({
    where: eq(schema.householdMembers.userId, userId),
    columns: { householdId: true, role: true },
  })
}
