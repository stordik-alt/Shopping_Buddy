import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

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

  // docs/37_SECURITY_REMEDIATION_PLAN.md, S5: the database itself refuses values the application never means to store.
  describe('range checks (migration 0104)', () => {
    const db = getDb()
    async function withHousehold(run: (householdId: string) => Promise<void>) {
      const [household] = await db.insert(schema.households).values({ name: '__test_range_checks__' }).returning()
      try {
        await run(household.id)
      } finally {
        await db.delete(schema.households).where(eq(schema.households.id, household.id))
      }
    }

    it('refuses a negative purchase total or discount, a non-positive expense, and an impossible age', async () => {
      await withHousehold(async (householdId) => {
        await expect(db.insert(schema.purchases).values({ householdId, date: '2026-10-13', total: '-1' })).rejects.toThrow()
        await expect(db.insert(schema.purchases).values({ householdId, date: '2026-10-13', total: '10', discount: '-0.5' })).rejects.toThrow()
        await expect(db.insert(schema.expenses).values({ householdId, date: '2026-10-13', category: 'Potraviny', amount: '0' })).rejects.toThrow()
        await expect(db.insert(schema.children).values({ householdId, name: 'Dítě', age: 130 })).rejects.toThrow()
        // ...while ordinary values are stored.
        await db.insert(schema.purchases).values({ householdId, date: '2026-10-13', total: '0', discount: '0' })
        await db.insert(schema.expenses).values({ householdId, date: '2026-10-13', category: 'Potraviny', amount: '0.01' })
        await db.insert(schema.children).values({ householdId, name: 'Dítě', age: 0 })
      })
    })

    it('refuses a non-positive shopping list quantity and a negative price', async () => {
      await withHousehold(async (householdId) => {
        const [list] = await db.insert(schema.shoppingLists).values({ householdId, name: 'Test' }).returning()
        await expect(db.insert(schema.shoppingListItems).values({ listId: list.id, name: 'Mléko', quantity: 0 })).rejects.toThrow()
        await expect(db.insert(schema.shoppingListItems).values({ listId: list.id, name: 'Mléko', price: '-1' })).rejects.toThrow()
        await db.insert(schema.shoppingListItems).values({ listId: list.id, name: 'Mléko', quantity: 0.5, price: '0' })
      })
    })
  })

  // Step 2 of the currency work (migration 0106, after lib/currency.ts normalises what receipts print).
  it('stores only three-letter upper-case currency codes', async () => {
    const db = getDb()
    for (const bad of ['Kč', 'czk', 'CZ', 'CZKK', '']) {
      await expect(db.insert(schema.households).values({ name: '__test_currency_check__', currency: bad }), bad).rejects.toThrow()
    }
    const [household] = await db.insert(schema.households).values({ name: '__test_currency_check__', currency: 'EUR' }).returning()
    try {
      expect(household.currency).toBe('EUR')
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, household.id))
    }
  })
})
