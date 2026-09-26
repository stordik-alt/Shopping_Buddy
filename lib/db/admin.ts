import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

/** Whether the Neon Auth user administers the app (a row in `app_admins`). Decided by the database
 *  from the session's user id — never from anything the client sends. */
export async function isAppAdmin(userId: string): Promise<boolean> {
  const row = await getDb().query.appAdmins.findFirst({ where: eq(schema.appAdmins.userId, userId), columns: { userId: true } })
  return row != null
}
