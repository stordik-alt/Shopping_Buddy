'use server'

import { and, count, desc, eq } from 'drizzle-orm'
import { requireHousehold } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { IDEA_MAX_NEW_PER_HOUSEHOLD, validateIdeaInput, type Idea, type IdeaInput } from '@/lib/ideas'

// Ideas for improving the app. Both actions work only on the caller's own household, resolved from
// the session — never from the request (CLAUDE.md section 9).

// The household's ideas are shown in a small dialog; this is more than anyone reads there.
const LIST_LIMIT = 100

/** The household's ideas, newest first. */
export async function listIdeasAction(): Promise<Idea[]> {
  const { householdId } = await requireHousehold()
  const rows = await getDb()
    .select({
      id: schema.featureIdeas.id,
      title: schema.featureIdeas.title,
      details: schema.featureIdeas.details,
      status: schema.featureIdeas.status,
      createdAt: schema.featureIdeas.createdAt,
      authorName: schema.householdMembers.name,
    })
    .from(schema.featureIdeas)
    .leftJoin(schema.householdMembers, eq(schema.householdMembers.id, schema.featureIdeas.memberId))
    .where(eq(schema.featureIdeas.householdId, householdId))
    .orderBy(desc(schema.featureIdeas.createdAt))
    .limit(LIST_LIMIT)
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
}

/** Saves a new idea for the caller's household and returns it. */
export async function submitIdeaAction(input: IdeaInput): Promise<Idea> {
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
  const member = await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.id, memberId), columns: { name: true } })
  return { id: row.id, title: row.title, details: row.details, status: row.status, createdAt: row.createdAt.toISOString(), authorName: member?.name ?? null }
}
