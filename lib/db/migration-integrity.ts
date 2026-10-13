import { createHash } from 'node:crypto'

// Integrity rules of the migration runner (lib/db/migrate.ts), kept pure so they can be tested without a
// database (docs/35_SECURITY_AUDIT.md, S4).

/** SHA-256 of a migration file. Line endings are normalised first: the same file checked out on Windows
 *  (CRLF) and on Linux (LF) must give the same checksum. */
export function checksumOf(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex')
}

export type IntegrityPlan = {
  /** Applied files whose content differs from what was applied — someone edited history. */
  changed: string[]
  /** Applied before checksums existed: the current content is recorded as the baseline. */
  toRecord: string[]
  /** Recorded as applied but no longer in the folder (renamed or deleted). */
  missing: string[]
}

/** Compares what the database says was applied with the files in the folder. `applied` maps a file name to
 *  its stored checksum (null for rows from before checksums existed). */
export function planIntegrity(applied: ReadonlyMap<string, string | null>, files: ReadonlyMap<string, string>): IntegrityPlan {
  const plan: IntegrityPlan = { changed: [], toRecord: [], missing: [] }
  for (const [name, stored] of applied) {
    const text = files.get(name)
    if (text === undefined) plan.missing.push(name)
    else if (stored === null) plan.toRecord.push(name)
    else if (stored !== checksumOf(text)) plan.changed.push(name)
  }
  return plan
}

/** `-- migrate: no-transaction` on its own line opts a file out of the single transaction it normally
 *  runs in — needed by the few statements PostgreSQL refuses inside one (CREATE INDEX CONCURRENTLY). */
export function runsInTransaction(text: string): boolean {
  return !/^\s*--\s*migrate:\s*no-transaction\s*$/im.test(text)
}

/** The fallback splitter cuts on `;` at a line end, which tears a `DO $$ … $$` block or a function body
 *  apart. A file with dollar quoting must say where its statements end with `--> statement-breakpoint`. */
export function needsBreakpointMarker(text: string): boolean {
  return text.includes('$$') && !text.includes('--> statement-breakpoint')
}
