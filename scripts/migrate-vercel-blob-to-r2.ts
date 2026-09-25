import 'dotenv/config'
import { appendFileSync, readFileSync } from 'node:fs'
import { and, eq, like } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { getReceiptFile, isValidReceiptKey, r2Ref } from '@/lib/storage'
import { r2ObjectDigest, r2Store, sha256Hex } from '@/lib/storage/r2'

// Copies receipt files from Vercel Blob to Cloudflare R2 and switches each receipt to its R2 copy
// (docs/cloudflare-r2.md). For every receipt_imports row whose image_url is still a Blob URL:
//
//   Blob download → R2 upload (same key) → R2 read-back, size + SHA-256 compared → row updated
//
// Safe to stop and re-run at any point:
//  - an R2 object that already holds the same bytes is not uploaded again;
//  - the row is updated only if its image_url is still the Blob URL that was copied (a concurrent
//    change wins), and only after the copy was verified;
//  - Blob files are NEVER deleted — they stay as the rollback copy until removed by hand later.
// Every switched row is appended to a log file (id, old Blob URL, new reference) so the switch can be
// undone exactly: `--rollback <log>` puts the old Blob URLs back.
//
// Usage (reads .env.local via `pnpm`/dotenv like the other scripts):
//   pnpm db:migrate-blob-to-r2 --dry-run          # read only: lists what would be copied
//   pnpm db:migrate-blob-to-r2 [--limit N]        # copy + switch
//   pnpm db:migrate-blob-to-r2 --rollback <log>   # restore the Blob URLs recorded in <log>
// The dry run downloads from Blob and reads R2 (to report sizes and existing copies) but never
// uploads, never writes the database and never deletes anything.

type Options = { dryRun: boolean; limit: number | null; rollback: string | null }

function parseArgs(argv: string[]): Options {
  const value = (flag: string) => {
    const index = argv.indexOf(flag)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const limit = value('--limit')
  if (limit !== undefined && !/^\d+$/.test(limit)) throw new Error('--limit needs a whole number')
  const rollback = value('--rollback') ?? null
  if (argv.includes('--rollback') && !rollback) throw new Error('--rollback needs the log file written by a previous run')
  return { dryRun: argv.includes('--dry-run'), limit: limit ? Number(limit) : null, rollback }
}

/** The object key a Blob URL was stored under: its path without the leading slash. */
function blobKey(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
}

type LogLine = { id: string; from: string; to: string }

async function migrate(options: Options) {
  const db = getDb()
  const rows = await db
    .select({ id: schema.receiptImports.id, imageUrl: schema.receiptImports.imageUrl })
    .from(schema.receiptImports)
    .where(like(schema.receiptImports.imageUrl, 'https://%'))
    .orderBy(schema.receiptImports.createdAt)
    .limit(options.limit ?? 1_000_000)

  const logFile = `blob-to-r2-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
  const counts = { total: rows.length, copied: 0, alreadyInR2: 0, switched: 0, skipped: 0, failed: 0, bytes: 0 }
  console.log(`${rows.length} receipt(s) still on Vercel Blob${options.dryRun ? ' — DRY RUN, nothing is written' : ''}`)

  for (const row of rows) {
    const from = row.imageUrl!
    const key = blobKey(from)
    const tag = `${row.id} ${key}`
    try {
      // Only keys the app itself writes are copied; anything else (e.g. an old test path) is left
      // on Blob and reported, never guessed into a new layout.
      if (!isValidReceiptKey(key)) {
        counts.skipped++
        console.warn(`SKIP  ${tag}: key is not receipts/{household}/{uuid}.{ext}`)
        continue
      }

      const file = await getReceiptFile(from)
      if (!file) {
        counts.skipped++
        console.warn(`SKIP  ${tag}: not found on Vercel Blob`)
        continue
      }
      const bytes = Buffer.from(await new Response(file.body).arrayBuffer())
      const sha256 = await sha256Hex(bytes)
      counts.bytes += bytes.byteLength

      const existing = await r2ObjectDigest(key)
      const alreadyCopied = existing != null && existing.size === bytes.byteLength && existing.sha256 === sha256
      if (existing && !alreadyCopied) {
        // Same key, different bytes: never overwrite something we did not write in this form.
        counts.failed++
        console.error(`FAIL  ${tag}: a different object already exists in R2 under this key`)
        continue
      }

      if (options.dryRun) {
        if (alreadyCopied) counts.alreadyInR2++
        console.log(`${alreadyCopied ? 'HAVE' : 'COPY'}  ${tag} (${bytes.byteLength} B)${alreadyCopied ? ' — already in R2, would switch' : ''}`)
        continue
      }

      if (alreadyCopied) counts.alreadyInR2++
      else {
        await r2Store.put(key, bytes, file.contentType)
        const copy = await r2ObjectDigest(key)
        if (copy == null || copy.size !== bytes.byteLength || copy.sha256 !== sha256) throw new Error('R2 copy does not match the Blob original')
        counts.copied++
      }

      const to = r2Ref(key)
      const updated = await db
        .update(schema.receiptImports)
        .set({ imageUrl: to, updatedAt: new Date() })
        .where(and(eq(schema.receiptImports.id, row.id), eq(schema.receiptImports.imageUrl, from)))
        .returning({ id: schema.receiptImports.id })
      if (updated.length === 0) {
        counts.skipped++
        console.warn(`SKIP  ${tag}: row changed meanwhile, left as it is (R2 copy kept)`)
        continue
      }
      appendFileSync(logFile, JSON.stringify({ id: row.id, from, to } satisfies LogLine) + '\n')
      counts.switched++
      console.log(`DONE  ${tag} (${bytes.byteLength} B)`)
    } catch (error) {
      counts.failed++
      console.error(`FAIL  ${tag}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  console.log(JSON.stringify({ event: 'blob_to_r2_summary', dryRun: options.dryRun, ...counts, log: options.dryRun ? null : logFile }))
  if (counts.failed > 0) process.exitCode = 1
}

async function rollback(logPath: string) {
  const lines = readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as LogLine)
  const db = getDb()
  let restored = 0
  for (const line of lines) {
    // Only rows still pointing at the copy made by that run are restored.
    const updated = await db
      .update(schema.receiptImports)
      .set({ imageUrl: line.from, updatedAt: new Date() })
      .where(and(eq(schema.receiptImports.id, line.id), eq(schema.receiptImports.imageUrl, line.to)))
      .returning({ id: schema.receiptImports.id })
    restored += updated.length
  }
  console.log(JSON.stringify({ event: 'blob_to_r2_rollback', lines: lines.length, restored }))
}

const options = parseArgs(process.argv.slice(2))
const run = options.rollback ? rollback(options.rollback) : migrate(options)
run.catch((error) => {
  console.error(error)
  process.exit(1)
})
