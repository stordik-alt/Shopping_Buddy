import { importOsmStores, syncAlbertStoreFormats } from '@/lib/db/store-directory'

// Imports the store chains' branches from OpenStreetMap (lib/db/store-directory.ts). The same
// import runs weekly as the cron /api/cron/import-stores; this is for the first fill and for
// checking what an import would do. Afterwards Albert's hypermarkets are moved to their own chain
// (lib/stores/albert-formats.ts; weekly as /api/cron/albert-store-formats). Dry run by default —
// prints the plan and writes nothing.
//   pnpm db:import-stores           (dry run)
//   pnpm db:import-stores --apply   (writes to the database in .env.local)
async function main() {
  const apply = process.argv.includes('--apply')
  console.log(apply ? 'Store import — WRITING to the database in .env.local' : 'Store import dry run — nothing is written (pass --apply to write)')
  const report = await importOsmStores({ apply })
  console.log(`Found ${report.found} branches with a usable address:`)
  for (const [chain, count] of Object.entries(report.perChain).sort((a, b) => b[1] - a[1])) console.log(`  ${chain.padEnd(10)} ${count}`)
  console.log(`New ${report.inserted}, updated ${report.updated}, existing branches adopted ${report.adopted}, unchanged ${report.unchanged}`)
  console.log(`Rejected: ${report.rejected['no-address']} without an address in the map, ${report.rejected['outside-cz']} outside Czechia; chain not in the app: ${report.unknownChain}`)
  console.log(`Imported earlier but no longer on the map (kept): ${report.notSeen}`)

  // In a dry run the branches the import would add are not in the database yet, so this only sorts
  // the branches already there.
  const albert = await syncAlbertStoreFormats({ apply })
  console.log(`Albert hypermarkets on albert.cz: ${albert.hypermarkets} (${albert.unreadable} pages unreadable)`)
  console.log(`  moved to "Albert Hypermarket": ${albert.moved}, already there: ${albert.alreadyMoved}, no matching branch: ${albert.unmatched.length}`)
  for (const store of albert.unmatched.slice(0, 10)) console.log(`    ${store}`)
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
