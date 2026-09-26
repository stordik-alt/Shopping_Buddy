import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { neon } from '@neondatabase/serverless'
import { deployMigrationDecision } from './migrate-guard'

// Minimal migration runner: applies any *.sql file in this directory that
// isn't recorded in `_migrations` yet, in filename order. Statements within a
// file run sequentially (the neon-http driver has no multi-statement
// transaction support), so each migration file should be written so partial
// application is safe to re-run or reason about.
//
// Author new migrations with `pnpm db:generate` (drizzle-kit) after editing
// lib/db/schema.ts, then apply with `pnpm db:migrate`. drizzle-kit's default
// postgresql output separates statements with a literal `--> statement-breakpoint`
// line rather than just `;` — split on that when present; a plain `;` followed
// by a newline is the fallback for a migration written by hand without it.
//
// Deployments: `pnpm build` runs this with `--vercel-production` before `next build`, so a Vercel
// production deployment applies its own migrations before its code goes live; every other build skips
// (lib/db/migrate-guard.ts). A failed migration fails the build, and the previous deployment keeps
// serving. Because the migrations run before the new code is live — and stay applied if the build
// then fails — each migration must work with the code already running: add, don't rename or drop in
// the same deployment (CLAUDE.md section 7).
const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations')

function splitStatements(text: string): string[] {
  const parts = text.includes('--> statement-breakpoint') ? text.split('--> statement-breakpoint') : text.split(/;\s*\n/)
  return parts.map((statement) => statement.trim()).filter(Boolean)
}

/** The database to migrate: production by default, or with `--test` (`pnpm db:migrate:test`) the
 *  separate test branch the test suite runs against (test/setup-test-database.ts), which needs the
 *  same migrations. */
function connectionString(): string {
  if (!process.argv.includes('--test')) return process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!
  const url = process.env.TEST_DATABASE_URL_UNPOOLED ?? process.env.TEST_DATABASE_URL
  if (!url) throw new Error('--test needs TEST_DATABASE_URL (the test branch) in .env.local')
  return url
}

/** How long a lock is honoured: longer than any migration takes, short enough that a build that died
 *  holding it does not block the next deployment for long. */
const LOCK_LEASE = '10 minutes'
const LOCK_WAIT_MS = 5_000
const LOCK_ATTEMPTS = 36 // three minutes

type Sql = ReturnType<typeof neon<false, false>>

/** One runner at a time: two deployments building at once must not apply the same file twice. The
 *  neon-http driver has no session to hold an advisory lock, so the lock is a row with a lease. */
async function withMigrationLock<T>(sql: Sql, work: () => Promise<T>): Promise<T> {
  await sql`CREATE TABLE IF NOT EXISTS _migration_lock (id int PRIMARY KEY CHECK (id = 1), holder text NOT NULL, acquired_at timestamptz NOT NULL DEFAULT now())`
  const holder = `${process.env.VERCEL_DEPLOYMENT_ID ?? 'local'}:${process.pid}:${Date.now()}`
  for (let attempt = 1; ; attempt++) {
    await sql.query(`DELETE FROM _migration_lock WHERE acquired_at < now() - interval '${LOCK_LEASE}'`)
    const taken = await sql`INSERT INTO _migration_lock (id, holder) VALUES (1, ${holder}) ON CONFLICT (id) DO NOTHING RETURNING holder`
    if (taken.length > 0) break
    if (attempt >= LOCK_ATTEMPTS) throw new Error('Another migration run holds the lock (_migration_lock); try again when it has finished')
    console.log('waiting for another migration run to finish…')
    await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_MS))
  }
  try {
    return await work()
  } finally {
    await sql`DELETE FROM _migration_lock WHERE holder = ${holder}`
  }
}

async function main() {
  if (process.argv.includes('--vercel-production')) {
    const decision = deployMigrationDecision(process.env)
    if (!decision.migrate) {
      console.log(`Migrations skipped: ${decision.reason}.`)
      return
    }
    console.log('Vercel production deployment: applying migrations before the build.')
  }
  const sql = neon(connectionString())
  await withMigrationLock(sql, () => applyMigrations(sql))
}

async function applyMigrations(sql: Sql) {
  await sql`CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`
  // Read under the lock: a run that waited sees what the other one applied.
  const applied = new Set((await sql`SELECT name FROM _migrations`).map((row) => row.name as string))

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip (already applied): ${file}`)
      continue
    }
    console.log(`applying: ${file}`)
    const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    const statements = splitStatements(text)
    for (const statement of statements) {
      await sql.query(statement)
    }
    await sql`INSERT INTO _migrations (name) VALUES (${file})`
  }

  console.log('Migrations up to date.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
