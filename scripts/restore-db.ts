import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decryptFile, parseBackupKey } from '@/lib/backup-crypto'
import { describeError } from '@/lib/errors'

// Restores an encrypted dump made by `pnpm db:backup` into an EMPTY database (a throwaway Neon
// branch for the restore drill, docs/09_BACKUP_RECOVERY.md). The target is passed explicitly and is
// never read from .env.local, so a restore cannot hit production by accident.
//   pnpm db:restore backups/<file>.dump.enc "<empty database url>"
// The decrypted dump lives in a private temp directory and is removed afterwards, also on failure.
function main() {
  const [file, target] = process.argv.slice(2)
  if (!file || !target) throw new Error('Usage: pnpm db:restore <backup.dump.enc> <empty database url>')
  const key = parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY)

  const directory = mkdtempSync(join(tmpdir(), 'sb-restore-'))
  try {
    const plain = join(directory, 'restore.dump')
    decryptFile(file, plain, key)
    const result = spawnSync('pg_restore', ['--no-owner', '--dbname', target, plain], { stdio: ['ignore', 'inherit', 'inherit'] })
    if (result.error) throw new Error(`Could not run pg_restore (${describeError(result.error)}). Install the PostgreSQL 18 client tools.`)
    if (result.status !== 0) throw new Error(`pg_restore finished with exit code ${result.status}; check the messages above.`)
    console.log('Restore finished.')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

try {
  main()
} catch (err) {
  console.error(describeError(err))
  process.exit(1)
}
