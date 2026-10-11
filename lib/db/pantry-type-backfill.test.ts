import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import { applyPantryTypeBackfill, planPantryTypeBackfill } from '@/lib/db/pantry-type-backfill'
import * as schema from '@/lib/db/schema'

// Against the test database; a throwaway household that is deleted afterwards.
const db = getDb()

describe('pantry type backfill', () => {
  it('gives untyped rows their type from the name, leaves the rest alone and never renames', async () => {
    const [household] = await db.insert(schema.households).values({ name: '__test_household_pantry_backfill__' }).returning()
    try {
      const butter = await db.query.productTypes.findFirst({ where: eq(schema.productTypes.key, 'kureci-prsa') })
      await db.insert(schema.pantryItems).values([
        { householdId: household.id, name: 'KUR.PRSA 500G', category: 'Potraviny', quantity: 1, unit: 'ks' },
        { householdId: household.id, name: 'Něco nepoznatelného xyz', category: 'Potraviny', quantity: 1, unit: 'ks' },
        // Already typed: never touched, even though the name would say otherwise.
        { householdId: household.id, name: 'Máslo', category: 'Potraviny', quantity: 1, unit: 'ks', productTypeId: butter!.id },
      ])

      const plan = await planPantryTypeBackfill({ householdId: household.id })
      expect(plan.assignments.map((a) => [a.name, a.typeKey])).toEqual([['KUR.PRSA 500G', 'kureci-prsa']])
      expect(plan.unplaced.map((row) => row.name)).toEqual(['Něco nepoznatelného xyz'])

      expect(await applyPantryTypeBackfill(plan.assignments)).toBe(1)
      // A second run finds nothing left to do.
      expect((await planPantryTypeBackfill({ householdId: household.id })).assignments).toEqual([])

      const rows = await db.query.pantryItems.findMany({ where: eq(schema.pantryItems.householdId, household.id) })
      const prsa = rows.find((row) => row.name === 'KUR.PRSA 500G')
      expect(prsa?.productTypeId).toBe(butter!.id)
      expect(rows.find((row) => row.name === 'Něco nepoznatelného xyz')?.productTypeId).toBeNull()
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, household.id))
    }
  })
})
