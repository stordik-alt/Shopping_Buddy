import { describeError } from '@/lib/errors'
import { syncAlbertStoreFormats } from '@/lib/db/store-directory'

// Moves the Albert branches that are hypermarkets to the "Albert Hypermarket" chain. Which branches
// are hypermarkets comes from Albert itself — its store sitemap and the store pages it lists
// (lib/stores/albert-formats.ts); the matched branches move in one transaction
// (lib/db/store-directory.ts).
//
// This runs from GitHub Actions (.github/workflows/albert-store-formats.yml), not from the Worker's
// cron: albert.cz answers HTTP 403 to every request from Cloudflare Workers' egress range, so the
// cron could only ever fail. The same reason moved Albert's flyer import to GitHub Actions
// (.github/workflows/manual-albert-flyer-import.yml).
//
// Dry run by default — prints the plan and writes nothing.
//   pnpm db:albert-store-formats           (dry run)
//   pnpm db:albert-store-formats --apply   (writes to the database in .env.local)
async function main() {
  const apply = process.argv.includes('--apply')
  console.log(apply ? 'Albert store formats — WRITING to the database in .env.local' : 'Albert store formats dry run — nothing is written (pass --apply to write)')
  const report = await syncAlbertStoreFormats({ apply })
  console.log(`Albert hypermarkets on albert.cz: ${report.hypermarkets} (${report.unreadable} pages unreadable)`)
  console.log(`  moved to "Albert Hypermarket": ${report.moved}, already there: ${report.alreadyMoved}, not moved (a hypermarket branch already at that address): ${report.blocked}, no matching branch: ${report.unmatched.length}`)
  for (const store of report.unmatched.slice(0, 10)) console.log(`    ${store}`)
  if (report.unmatched.length > 10) console.log(`    … and ${report.unmatched.length - 10} more`)
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(describeError(err))
  process.exit(1)
})
