import { desc, eq, type SQL } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { AdminIdea } from '@/lib/ideas'

// Reads of the improvement ideas. Authorization is the caller's job: the household's own list is for
// any member (app/actions/ideas.ts), the list across households is for administrators only.

// Far more than anyone reads on a screen; keeps one read bounded as the list grows.
const LIST_LIMIT = 200

async function readIdeas(where?: SQL): Promise<AdminIdea[]> {
  const rows = await getDb()
    .select({
      id: schema.featureIdeas.id,
      title: schema.featureIdeas.title,
      details: schema.featureIdeas.details,
      status: schema.featureIdeas.status,
      createdAt: schema.featureIdeas.createdAt,
      authorName: schema.householdMembers.name,
      householdName: schema.households.name,
    })
    .from(schema.featureIdeas)
    .innerJoin(schema.households, eq(schema.households.id, schema.featureIdeas.householdId))
    .leftJoin(schema.householdMembers, eq(schema.householdMembers.id, schema.featureIdeas.memberId))
    .where(where)
    .orderBy(desc(schema.featureIdeas.createdAt))
    .limit(LIST_LIMIT)
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
}

/** One household's ideas, newest first. */
export const listHouseholdIdeas = (householdId: string) => readIdeas(eq(schema.featureIdeas.householdId, householdId))

/** Every household's ideas, newest first — administrators only. */
export const listAllIdeas = () => readIdeas()
