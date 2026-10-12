import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'

// The database built from the migrations alone must have the keys the application relies on. A key that
// only exists on databases created by hand-written migrations that are no longer in the repository goes
// missing on every new branch or CI database (docs/37_SECURITY_REMEDIATION_PLAN.md, V3).
describe('schema integrity', () => {
  it('ties household_members.user_id to the login account and detaches it when the account is deleted', async () => {
    const result = await getDb().execute<{ def: string }>(sql`
      select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'public.household_members'::regclass and contype = 'f' and conname = 'household_members_user_id_neon_auth_user_id_fk'`)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].def).toBe('FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE SET NULL')
  })

  it('keeps one household membership per account', async () => {
    const result = await getDb().execute<{ indexdef: string }>(sql`select indexdef from pg_indexes where tablename = 'household_members' and indexname = 'household_members_user_id_unique'`)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].indexdef).toContain('UNIQUE')
  })
})
