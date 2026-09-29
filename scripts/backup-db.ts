import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { describeError } from '@/lib/errors'

// Logical backup of the production database (every schema, including neon_auth where the accounts
// live) into backups/<timestamp>.dump, PostgreSQL custom format. Neon's own point-in-time restore
// only reaches back 6 hours on the free plan, so this file is the only way back from a mistake
// noticed later. Needs `pg_dump` (PostgreSQL 18 client tools) on the PATH. backups/ is git-ignored:
// the dump holds personal data, so keep it off GitHub (the repository is public) and out of shared folders.
//   pnpm db:backup
//   pg_restore --no-owner --dbname <empty database url> backups/<file>.dump   (restore drill: docs/09_BACKUP_RECOVERY.md)
function main() {
  // The direct (unpooled) connection: pg_dump holds one long transaction, which the pooler does not allow.
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set (run it through pnpm db:backup so .env.local is loaded).')

  const directory = 'backups'
  mkdirSync(directory, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = join(directory, `shopping-buddy-${stamp}.dump`)

  const result = spawnSync('pg_dump', ['--format=custom', '--no-owner', '--file', file, url], { stdio: ['ignore', 'inherit', 'inherit'] })
  if (result.error) throw new Error(`Could not run pg_dump (${describeError(result.error)}). Install the PostgreSQL 18 client tools and make sure pg_dump is on the PATH.`)
  if (result.status !== 0) throw new Error(`pg_dump failed with exit code ${result.status}.`)
  console.log(`Backup written to ${file}`)
}

try {
  main()
} catch (err) {
  console.error(describeError(err))
  process.exit(1)
}
