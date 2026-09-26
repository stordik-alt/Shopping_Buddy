import { eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import { listAllIdeas } from '@/lib/db/ideas'
import * as schema from '@/lib/db/schema'
import { IDEA_MAX_NEW_PER_HOUSEHOLD } from '@/lib/ideas'
import { listIdeasAction, setIdeaStatusAction, submitIdeaAction } from '@/app/actions/ideas'

// Integration coverage of the ideas actions against the real test database: an idea is saved for the
// caller's own household only, listing never shows another household's ideas, and only an
// administrator (a row in app_admins) can change a status. Only the session lookup is replaced; the
// household and admin checks are the real code.
let signedInUserId = ''
vi.mock('@/lib/auth/server', () => ({ auth: { getSession: () => Promise.resolve({ data: { user: { id: signedInUserId, email: 'test@example.com' } } }) } }))

const db = getDb()
const householdIds: string[] = []
const userIds: string[] = []
type Person = { userId: string; householdId: string; memberId: string }
let a: Person
let b: Person

async function createMember(name: string): Promise<Person> {
  const auth = await db.execute<{ id: string }>(sql`insert into neon_auth."user" (name, email, "emailVerified") values (${name}, ${`ideas-${crypto.randomUUID()}@example.com`}, false) returning id`)
  const userId = auth.rows[0].id
  userIds.push(userId)
  const [household] = await db.insert(schema.households).values({ name: '__test_household_ideas__' }).returning()
  householdIds.push(household.id)
  const [member] = await db.insert(schema.householdMembers).values({ householdId: household.id, userId, name, role: 'owner' }).returning()
  return { userId, householdId: household.id, memberId: member.id }
}

beforeAll(async () => {
  a = await createMember('Ideas A')
  b = await createMember('Ideas B')
})

afterAll(async () => {
  await db.delete(schema.appAdmins).where(inArray(schema.appAdmins.userId, userIds))
  await db.delete(schema.households).where(inArray(schema.households.id, householdIds)) // cascades to feature_ideas
  await db.execute(sql`delete from neon_auth."user" where id in (${sql.join(userIds.map((id) => sql`${id}::uuid`), sql`, `)})`)
}, 60_000)

describe('ideas actions', () => {
  it("saves a trimmed idea for the caller's household with status \"new\", the author and the household name", async () => {
    signedInUserId = a.userId
    const saved = await submitIdeaAction({ title: '  Sdílený seznam ', details: 'Odkazem' })
    expect(saved).toMatchObject({ title: 'Sdílený seznam', details: 'Odkazem', status: 'new', authorName: 'Ideas A', householdName: '__test_household_ideas__' })
    const row = await db.query.featureIdeas.findFirst({ where: eq(schema.featureIdeas.id, saved.id) })
    expect(row?.householdId).toBe(a.householdId)
  })

  it("lists only the caller's household ideas, newest first", async () => {
    signedInUserId = a.userId
    await submitIdeaAction({ title: 'Druhý nápad', details: '' })
    signedInUserId = b.userId
    await submitIdeaAction({ title: 'Cizí nápad', details: '' })
    signedInUserId = a.userId
    expect((await listIdeasAction()).map((idea) => idea.title)).toEqual(['Druhý nápad', 'Sdílený seznam'])
  })

  it('rejects an invalid idea with a readable message', async () => {
    signedInUserId = a.userId
    await expect(submitIdeaAction({ title: '   ', details: '' })).rejects.toThrow('Napište stručně')
  })

  it('refuses more waiting ideas than the household limit', async () => {
    signedInUserId = b.userId
    await db.insert(schema.featureIdeas).values(Array.from({ length: IDEA_MAX_NEW_PER_HOUSEHOLD }, (_, i) => ({ householdId: b.householdId, memberId: b.memberId, title: `Idea ${i}` })))
    await expect(submitIdeaAction({ title: 'Další', details: '' })).rejects.toThrow('hodně nápadů')
  })
})

describe('setIdeaStatusAction', () => {
  it('refuses an account that is not an administrator, and changes nothing', async () => {
    signedInUserId = a.userId
    const [idea] = await listIdeasAction()
    await expect(setIdeaStatusAction(idea.id, 'done')).rejects.toThrow('Administrators only')
    expect((await db.query.featureIdeas.findFirst({ where: eq(schema.featureIdeas.id, idea.id) }))?.status).toBe('new')
  })

  it("lets an administrator change the status of another household's idea", async () => {
    signedInUserId = a.userId
    const [idea] = await listIdeasAction()
    await db.insert(schema.appAdmins).values({ userId: b.userId })
    signedInUserId = b.userId
    await setIdeaStatusAction(idea.id, 'planned')
    expect((await db.query.featureIdeas.findFirst({ where: eq(schema.featureIdeas.id, idea.id) }))?.status).toBe('planned')
    // The administrator's list across households includes it, with its household.
    expect((await listAllIdeas()).find((row) => row.id === idea.id)?.householdName).toBe('__test_household_ideas__')
  })

  it('rejects an invalid status and an unknown idea', async () => {
    signedInUserId = b.userId
    const [idea] = await listAllIdeas()
    await expect(setIdeaStatusAction(idea.id, 'bogus' as never)).rejects.toThrow('Neplatný stav')
    await expect(setIdeaStatusAction(crypto.randomUUID(), 'done')).rejects.toThrow('už neexistuje')
  })
})
