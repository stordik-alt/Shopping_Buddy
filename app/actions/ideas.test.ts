import { eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { IDEA_MAX_NEW_PER_HOUSEHOLD } from '@/lib/ideas'
import { listIdeasAction, submitIdeaAction } from '@/app/actions/ideas'

// Integration coverage of the ideas actions against the real test database: an idea is saved for the
// caller's own household only, and listing never shows another household's ideas.
let current: { householdId: string; memberId: string }
vi.mock('@/lib/auth/authorize', () => ({ requireHousehold: () => Promise.resolve({ userId: 'unused', userEmail: 'test@example.com', role: 'owner', ...current }) }))

const db = getDb()
const householdIds: string[] = []
const userIds: string[] = []
let a: { householdId: string; memberId: string }
let b: { householdId: string; memberId: string }

async function createMember(name: string) {
  const auth = await db.execute<{ id: string }>(sql`insert into neon_auth."user" (name, email, "emailVerified") values (${name}, ${`ideas-${crypto.randomUUID()}@example.com`}, false) returning id`)
  userIds.push(auth.rows[0].id)
  const [household] = await db.insert(schema.households).values({ name: '__test_household_ideas__' }).returning()
  householdIds.push(household.id)
  const [member] = await db.insert(schema.householdMembers).values({ householdId: household.id, userId: auth.rows[0].id, name, role: 'owner' }).returning()
  return { householdId: household.id, memberId: member.id }
}

beforeAll(async () => {
  a = await createMember('Ideas A')
  b = await createMember('Ideas B')
})

afterAll(async () => {
  await db.delete(schema.households).where(inArray(schema.households.id, householdIds)) // cascades to feature_ideas
  await db.execute(sql`delete from neon_auth."user" where id in (${sql.join(userIds.map((id) => sql`${id}::uuid`), sql`, `)})`)
}, 60_000)

describe('ideas actions', () => {
  it('saves a trimmed idea for the caller\'s household with status "new" and the author', async () => {
    current = a
    const saved = await submitIdeaAction({ title: '  Sdílený seznam ', details: 'Odkazem' })
    expect(saved).toMatchObject({ title: 'Sdílený seznam', details: 'Odkazem', status: 'new', authorName: 'Ideas A' })
    const row = await db.query.featureIdeas.findFirst({ where: eq(schema.featureIdeas.id, saved.id) })
    expect(row?.householdId).toBe(a.householdId)
  })

  it('lists only the caller\'s household ideas, newest first', async () => {
    current = a
    await submitIdeaAction({ title: 'Druhý nápad', details: '' })
    current = b
    await submitIdeaAction({ title: 'Cizí nápad', details: '' })
    current = a
    const titles = (await listIdeasAction()).map((idea) => idea.title)
    expect(titles).toEqual(['Druhý nápad', 'Sdílený seznam'])
  })

  it('rejects an invalid idea with a readable message', async () => {
    current = a
    await expect(submitIdeaAction({ title: '   ', details: '' })).rejects.toThrow('Napište stručně')
  })

  it('refuses more waiting ideas than the household limit', async () => {
    current = b
    await db.insert(schema.featureIdeas).values(Array.from({ length: IDEA_MAX_NEW_PER_HOUSEHOLD }, (_, i) => ({ householdId: b.householdId, memberId: b.memberId, title: `Idea ${i}` })))
    await expect(submitIdeaAction({ title: 'Další', details: '' })).rejects.toThrow('hodně nápadů')
  })
})
