import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { neon } from '@neondatabase/serverless'

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
const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations')

function splitStatements(text: string): string[] {
  const parts = text.includes('--> statement-breakpoint') ? text.split('--> statement-breakpoint') : text.split(/;\s*\n/)
  return parts.map((statement) => statement.trim()).filter(Boolean)
}

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!)

  await sql`CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`
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
