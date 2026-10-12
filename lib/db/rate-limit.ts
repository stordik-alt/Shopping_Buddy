import { lt, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

/** Counts one hit against `key` in a fixed window and says whether it is still within `max`.
 *  One atomic upsert, so concurrent requests on different serverless instances cannot both slip past
 *  the limit (an in-memory counter is per instance and starts again on every cold start). A window that
 *  has passed is reset by the same statement. Hits above the limit are still counted, which only keeps
 *  a client that keeps trying locked out until its window ends. */
export async function hitRateLimit(key: string, limit: { max: number; windowMs: number }): Promise<{ allowed: boolean; hits: number }> {
  const windowSeconds = limit.windowMs / 1000
  const expired = sql`${schema.rateLimits.windowStartedAt} < now() - make_interval(secs => ${windowSeconds})`
  const [row] = await getDb()
    .insert(schema.rateLimits)
    .values({ key, hits: 1 })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        windowStartedAt: sql`CASE WHEN ${expired} THEN now() ELSE ${schema.rateLimits.windowStartedAt} END`,
        hits: sql`CASE WHEN ${expired} THEN 1 ELSE ${schema.rateLimits.hits} + 1 END`,
      },
    })
    .returning({ hits: schema.rateLimits.hits })
  // Old keys (one per address that ever tried) would otherwise pile up; clearing them now and then
  // keeps the table small without a scheduled job.
  if (Math.random() < 0.01) await purgeStaleRateLimits()
  return { allowed: row.hits <= limit.max, hits: row.hits }
}

/** Removes counters whose window is long over (nothing reads a window older than a day). */
export async function purgeStaleRateLimits(): Promise<void> {
  await getDb().delete(schema.rateLimits).where(lt(schema.rateLimits.windowStartedAt, sql`now() - interval '2 days'`))
}
