import { neon } from '@neondatabase/serverless'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { cache } from 'react'
import * as schema from '@/lib/db/schema'
import { poolMax, usesPgDriver } from '@/lib/db/local'

// Cloudflare Workers use Hyperdrive over `pg`; Node.js keeps Neon HTTP by default, while a loopback
// DATABASE_URL selects local PostgreSQL over TCP. Both drivers expose the same Drizzle query API.
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

type HyperdriveBinding = { connectionString?: unknown }
type HyperdriveBindingName = 'HYPERDRIVE' | 'HYPERDRIVE_PANTRY_FRESH'

function isCloudflareWorkerRuntime(): boolean {
  // `navigator.userAgent` is set by workerd and is unavailable in Node.js test/build processes.
  // WebSocketPair is a Workers-only global and covers runtimes where navigator is not exposed.
  const workerGlobal = globalThis as typeof globalThis & {
    WebSocketPair?: unknown
    navigator?: { userAgent?: string }
  }
  return workerGlobal.navigator?.userAgent === 'Cloudflare-Workers' || typeof workerGlobal.WebSocketPair !== 'undefined'
}

function isMissingCloudflareContextError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  // @opennextjs/cloudflare 1.20.6 uses these two explicit errors when no per-request
  // context has been installed (ordinary Node.js, tests, or static generation).
  return error.message.includes('`getCloudflareContext` has been called without having called') ||
    error.message.includes('`getCloudflareContext` has been called in sync mode')
}

function isPostgresConnectionString(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'postgres:' || url.protocol === 'postgresql:') && url.hostname.length > 0
  } catch {
    return false
  }
}

function getHyperdriveConnectionString(bindingName: HyperdriveBindingName): string | undefined {
  let env: Partial<Record<HyperdriveBindingName, HyperdriveBinding>>
  try {
    env = getCloudflareContext().env as unknown as Partial<Record<HyperdriveBindingName, HyperdriveBinding>>
  } catch (error) {
    // Do not hide actual OpenNext/configuration failures. Node.js tests and builds do not have
    // a Worker context, whereas a Worker without one is an application configuration error.
    if (isMissingCloudflareContextError(error) && !isCloudflareWorkerRuntime()) return undefined
    if (isMissingCloudflareContextError(error)) {
      throw new Error('Cloudflare Worker database configuration is unavailable: OpenNext did not provide a request context.')
    }
    throw error
  }

  const connectionString = env[bindingName]?.connectionString
  if (!isPostgresConnectionString(connectionString)) {
    throw new Error(`Cloudflare Worker requires a valid ${bindingName} binding with a PostgreSQL connection string.`)
  }
  return connectionString
}

function createPgDb(url: string, hyperdrive: boolean) {
  if (hyperdrive) {
    // OpenNext's React cache scopes this pool to the current request; do not store it in module/global
    // state. Allow the pool to reuse a connection for several queries within that request. maxUses: 1
    // forced a new Hyperdrive socket for every query, which is particularly costly for the budget
    // outlook's parallel reads and can trigger repeated CloudflareSocket lifecycle failures.
    // The pool is request-scoped, so this reuse does not carry a client into the next request.
    const pool = new Pool({ connectionString: url, max: poolMax(), maxUses: 20 })
    const db = drizzlePg(pool, { schema })
    return Object.assign(db, {
      batch: (queries: BatchQuery[]) => runBatch(pool, queries),
    }) as unknown as ReturnType<typeof drizzleNeon<typeof schema>>
  }

  if (usesPgDriver(url)) {
    // Preserve the existing process-wide pool for local PostgreSQL in Node.js.
    const globalPool = globalThis as unknown as {
      __shoppingBuddyPool?: Pool
    }
    const pool = (globalPool.__shoppingBuddyPool ??= new Pool({
      connectionString: url,
      max: poolMax(),
    }))

    const db = drizzlePg(pool, { schema })
    return Object.assign(db, {
      batch: (queries: BatchQuery[]) => runBatch(pool, queries),
    }) as unknown as ReturnType<typeof drizzleNeon<typeof schema>>
  }

  return drizzleNeon(neon(url), { schema })
}

const getRequestHyperdriveDb = cache((connectionString: string) => createPgDb(connectionString, true))

let _db: ReturnType<typeof createPgDb> | null = null

export function getDb(bindingName: HyperdriveBindingName = 'HYPERDRIVE') {
  const hyperdriveUrl = getHyperdriveConnectionString(bindingName)
  if (hyperdriveUrl) return getRequestHyperdriveDb(hyperdriveUrl)
  if (!_db) _db = createPgDb(process.env.DATABASE_URL!, false)
  return _db
}

