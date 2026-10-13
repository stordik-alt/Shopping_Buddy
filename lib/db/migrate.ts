import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { usesPgDriver } from './local'
import { createRawSql, type RawSql } from './raw-sql'
import { deployMigrationDecision } from './migrate-guard'
import { checksumOf, needsBreakpointMarker, planIntegrity, runsInTransaction } from './migration-integrity'

// Minimal migration runner: applies any *.sql file in this directory that
// isn't recorded in `_migrations` yet, in filename order. A file runs in ONE
// transaction together with its `_migrations` row, so a failure leaves nothing
// half-applied (docs/35_SECURITY_AUDIT.md, S4). The few statements PostgreSQL
// refuses inside a transaction (CREATE INDEX CONCURRENTLY) need
// `-- migrate: no-transaction` in the file; such a file runs statement by
// statement and must be written so partial application is safe to re-run.
// Every applied file's SHA-256 is stored; a later edit of an applied file stops
// the run (lib/db/migration-integrity.ts) — fix forward with a new migration.
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

type Sql = RawSql

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
  const url = connectionString()
  const sql = createRawSql(url)
  try {
    // A plain local PostgreSQL has no Neon Auth: create the identity tables the migrations reference.
    if (usesPgDriver(url)) await sql.query(readFileSync(join(import.meta.dirname, 'local-auth-schema.sql'), 'utf8'))
    await withMigrationLock(sql, () => applyMigrations(sql))
  } finally {
    await sql.end()
  }
}

async function applyMigrations(sql: Sql) {
  await sql`CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`
  // Additive, so a runner older than this column keeps working against the same table.
  await sql`ALTER TABLE _migrations ADD COLUMN IF NOT EXISTS checksum text`
  // Read under the lock: a run that waited sees what the other one applied.
  const appliedRows = await sql`SELECT name, checksum FROM _migrations`
  const applied = new Map(appliedRows.map((row) => [row.name as string, (row.checksum as string | null) ?? null]))

  const names = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  const files = new Map(names.map((name) => [name, readFileSync(join(MIGRATIONS_DIR, name), 'utf8')]))

  const integrity = planIntegrity(applied, files)
  if (integrity.changed.length > 0) {
    throw new Error(`Applied migration(s) were edited after they ran: ${integrity.changed.join(', ')}. Restore the file and put the change in a new migration.`)
  }
  for (const name of integrity.missing) console.warn(`warning: ${name} is recorded as applied but is no longer in the migrations folder`)
  // Rows from before checksums existed: what the file says now becomes the baseline.
  for (const name of integrity.toRecord) await sql`UPDATE _migrations SET checksum = ${checksumOf(files.get(name)!)} WHERE name = ${name}`

  for (const file of names) {
    if (applied.has(file)) {
      console.log(`skip (already applied): ${file}`)
      continue
    }
    console.log(`applying: ${file}`)
    const text = files.get(file)!
    if (needsBreakpointMarker(text)) {
      throw new Error(`${file} has a $$ block but no "--> statement-breakpoint" line, so it would be cut in the wrong places. Put the marker between its statements.`)
    }
    const statements = splitStatements(text)
    const record = `INSERT INTO _migrations (name, checksum) VALUES ('${file.replace(/'/g, "''")}', '${checksumOf(text)}')`
    if (runsInTransaction(text)) {
      await sql.transaction([...statements, record])
    } else {
      for (const statement of statements) await sql.query(statement)
      await sql.query(record)
    }
  }

  console.log('Migrations up to date.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
