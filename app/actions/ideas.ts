'use server'

import { and, count, eq } from 'drizzle-orm'
import { requireAdmin, requireHousehold } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import { listHouseholdIdeas } from '@/lib/db/ideas'
import * as schema from '@/lib/db/schema'
import { IDEA_MAX_NEW_PER_HOUSEHOLD, IDEA_STATUSES, validateIdeaInput, type AdminIdea, type Idea, type IdeaInput, type IdeaStatus } from '@/lib/ideas'

// Ideas for improving the app. The household actions work only on the caller's own household,
// resolved from the session — never from the request (CLAUDE.md section 9); changing a status is for
// administrators only (`app_admins`).

/** The household's ideas, newest first. */
export async function listIdeasAction(): Promise<Idea[]> {
  const { householdId } = await requireHousehold()
  return listHouseholdIdeas(householdId)
}

/** Saves a new idea for the caller's household and returns it. */
export async function submitIdeaAction(input: IdeaInput): Promise<AdminIdea> {
  const { householdId, memberId } = await requireHousehold()
  const checked = validateIdeaInput(input)
  if (!checked.ok) throw new Error(checked.error)

  const db = getDb()
  const [{ waiting }] = await db
    .select({ waiting: count() })
    .from(schema.featureIdeas)
    .where(and(eq(schema.featureIdeas.householdId, householdId), eq(schema.featureIdeas.status, 'new')))
  if (waiting >= IDEA_MAX_NEW_PER_HOUSEHOLD) throw new Error('Máte už hodně nápadů čekajících na posouzení. Zkuste to prosím později.')

  const [row] = await db.insert(schema.featureIdeas).values({ householdId, memberId, title: checked.title, details: checked.details }).returning()
  const [author, household] = await Promise.all([
    db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.id, memberId), columns: { name: true } }),
    db.query.households.findFirst({ where: eq(schema.households.id, householdId), columns: { name: true } }),
  ])
  return {
    id: row.id,
    title: row.title,
    details: row.details,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    authorName: author?.name ?? null,
    householdName: household?.name ?? '',
  }
}

/** Moves an idea to another status (any household's idea) — administrators only. */
export async function setIdeaStatusAction(ideaId: string, status: IdeaStatus): Promise<void> {
  await requireAdmin()
  if (typeof ideaId !== 'string' || !/^[0-9a-f-]{36}$/i.test(ideaId)) throw new Error('Neplatný nápad.')
  if (!IDEA_STATUSES.includes(status)) throw new Error('Neplatný stav.')
  const updated = await getDb().update(schema.featureIdeas).set({ status }).where(eq(schema.featureIdeas.id, ideaId)).returning({ id: schema.featureIdeas.id })
  if (updated.length === 0) throw new Error('Nápad už neexistuje.')
}
