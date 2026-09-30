import { neon } from '@neondatabase/serverless'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '@/lib/db/schema'
import { isLocalDatabaseUrl } from '@/lib/db/local'

// Neon (HTTP) in production; a loopback DATABASE_URL selects a local PostgreSQL over TCP. Both
// drivers expose the same Drizzle query API, so nothing above this file cares which one it is.
type BatchQuery = { toSQL?: () => { sql: string; params: unknown[] }; getQuery?: () => { sql: string; params: unknown[] } }

// db.batch() is a Neon-HTTP feature: several statements applied atomically in one round trip. On a
// local pool the same guarantee comes from one transaction on one connection. Results are the raw
// row lists; the callers that batch (pantry, recurring, purchase items, store directory) ignore them.
async function runBatch(pool: Pool, queries: BatchQuery[]) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const results: unknown[] = []
    for (const query of queries) {
      const { sql, params } = (query.toSQL ?? query.getQuery)!.call(query)
      results.push((await client.query(sql, params)).rows)
    }
    await client.query('COMMIT')
    return results
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

function createDb() {
  const url = process.env.DATABASE_URL!
  if (isLocalDatabaseUrl(url)) {
    // One pool per process: Next.js dev hot reloads would otherwise leak a pool per reload.
    const globalPool = globalThis as unknown as { __shoppingBuddyPool?: Pool }
    const pool = (globalPool.__shoppingBuddyPool ??= new Pool({ connectionString: url }))
    const db = drizzlePg(pool, { schema })
    return Object.assign(db, { batch: (queries: BatchQuery[]) => runBatch(pool, queries) }) as unknown as ReturnType<typeof drizzleNeon<typeof schema>>
  }
  return drizzleNeon(neon(url), { schema })
}

let _db: ReturnType<typeof createDb> | null = null

export function getDb() {
  if (!_db) _db = createDb()
  return _db
}
