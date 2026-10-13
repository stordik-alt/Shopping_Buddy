import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { encryptFile, parseBackupKey } from '@/lib/backup-crypto'
import { describeError } from '@/lib/errors'

// Logical backup of the production database (every schema, including neon_auth where the accounts
// live) into backups/<timestamp>.dump.enc: a PostgreSQL custom-format dump, encrypted with AES-256-GCM
// (lib/backup-crypto.ts, key in BACKUP_ENCRYPTION_KEY). The dump holds password hashes and session
// tokens, so the unencrypted file exists only briefly and is deleted even when the run fails. Neon's own point-in-time restore
// only reaches back 6 hours on the free plan, so this file is the only way back from a mistake
// noticed later. Needs `pg_dump` (PostgreSQL 18 client tools) on the PATH. backups/ is git-ignored:
// the dump holds personal data, so keep it off GitHub (the repository is public) and out of shared folders.
//   pnpm db:backup
//   pnpm db:restore backups/<file>.dump.enc <empty database url>   (restore drill: docs/09_BACKUP_RECOVERY.md)
function main() {
  // The direct (unpooled) connection: pg_dump holds one long transaction, which the pooler does not allow.
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set (run it through pnpm db:backup so .env.local is loaded).')

  // Checked first, so a missing key fails before a long dump rather than after it.
  const key = parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY)

  const directory = 'backups'
  mkdirSync(directory, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const plain = join(directory, `shopping-buddy-${stamp}.dump.tmp`)
  const file = join(directory, `shopping-buddy-${stamp}.dump.enc`)

  try {
    const result = spawnSync('pg_dump', ['--format=custom', '--no-owner', '--file', plain, url], { stdio: ['ignore', 'inherit', 'inherit'] })
    if (result.error) throw new Error(`Could not run pg_dump (${describeError(result.error)}). Install the PostgreSQL 18 client tools and make sure pg_dump is on the PATH.`)
    if (result.status !== 0) throw new Error(`pg_dump failed with exit code ${result.status}.`)
    encryptFile(plain, file, key)
  } finally {
    rmSync(plain, { force: true })
  }
  console.log(`Encrypted backup written to ${file}`)
}

try {
  main()
} catch (err) {
  console.error(describeError(err))
  process.exit(1)
}
