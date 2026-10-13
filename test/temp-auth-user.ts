import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'

// A throwaway login account (neon_auth."user") for tests whose rows must point at a real user: the decision
// columns of the catalog change requests are foreign keys to it (migration 0111). Delete it in afterAll.
export async function createTempAuthUser(label = 'Test'): Promise<string> {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into neon_auth."user" (name, email, "emailVerified") values (${label}, ${`temp-${crypto.randomUUID()}@example.com`}, false) returning id`,
  )
  return result.rows[0].id
}

export async function deleteTempAuthUser(userId: string): Promise<void> {
  await getDb().execute(sql`delete from neon_auth."user" where id = ${userId}::uuid`)
}
