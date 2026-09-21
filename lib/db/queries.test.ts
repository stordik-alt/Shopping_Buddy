import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { joinHouseholdViaInvitation } from '@/lib/db/queries'

// Regression coverage for the "household events" notification work (docs/07_CHANGELOG.md,
// 2026-09-21) and for the join-via-invitation logic itself, which docs/01_CURRENT_STATE.md
// flagged as having no automated tests. Runs against the real dev database — everything it
// creates is deleted in afterAll. Needs a real neon_auth user id to satisfy
// household_members.user_id's foreign key; reuses whichever account is already signed in to this
// dev database rather than fabricating one (there is no local `users` table to insert into).
const db = getDb()

async function anyRealUserId(): Promise<string> {
  const result = await db.execute<{ id: string }>(`select id from neon_auth."user" limit 1`)
  const row = result.rows[0]
  if (!row) throw new Error('No neon_auth user exists in this database to run this test against')
  return row.id
}

const createdHouseholdIds: string[] = []

afterAll(async () => {
  for (const householdId of createdHouseholdIds) {
    await db.delete(schema.notifications).where(eq(schema.notifications.householdId, householdId))
    await db.delete(schema.householdMembers).where(eq(schema.householdMembers.householdId, householdId))
    await db.delete(schema.invitations).where(eq(schema.invitations.householdId, householdId))
    await db.delete(schema.households).where(eq(schema.households.id, householdId))
  }
})

async function makeInvitation() {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_join__' }).returning()
  createdHouseholdIds.push(household.id)
  const [invitation] = await db
    .insert(schema.invitations)
    .values({ householdId: household.id, email: 'join-test@example.com', token: crypto.randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) })
    .returning()
  return { household, invitation }
}

describe('joinHouseholdViaInvitation', () => {
  it('creates a member row, marks the invitation accepted, and does both for the right household', async () => {
    const { household, invitation } = await makeInvitation()
    const userId = await anyRealUserId()

    const joined = await joinHouseholdViaInvitation(userId, 'Testovací Uživatel', invitation)
    expect(joined.id).toBe(household.id)

    const member = await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.householdId, household.id) })
    expect(member?.userId).toBe(userId)
    expect(member?.role).toBe('member')

    const updatedInvitation = await db.query.invitations.findFirst({ where: eq(schema.invitations.id, invitation.id) })
    expect(updatedInvitation?.status).toBe('accepted')

    await db.delete(schema.householdMembers).where(eq(schema.householdMembers.householdId, household.id)) // don't leave this user in two households for later tests/real usage
  })

  it('raises a household-events notification naming the person who joined', async () => {
    const { household, invitation } = await makeInvitation()
    const userId = await anyRealUserId()

    await joinHouseholdViaInvitation(userId, 'Nový Člen', invitation)

    const notifications = await db.query.notifications.findMany({ where: eq(schema.notifications.householdId, household.id) })
    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toBe('Nový člen domácnosti')
    expect(notifications[0].detail).toContain('Nový Člen')

    await db.delete(schema.householdMembers).where(eq(schema.householdMembers.householdId, household.id))
  })
})
