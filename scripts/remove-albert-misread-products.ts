import { removeAlbertMisreadProducts } from '@/lib/db/albert-misread-products'

// One-off repair: remove products the Albert flyer import created from a claim read as a name
// (lib/ingestion/albert.ts, albertNameProblem). Dry-run by default — prints what it would remove and
// changes nothing. Pass --apply to write.
//   pnpm db:remove-albert-misread            (dry run)
//   pnpm db:remove-albert-misread --apply
async function main() {
  const apply = process.argv.includes('--apply')
  const report = await removeAlbertMisreadProducts({ apply })
  for (const product of report.removed) console.log(`${apply ? 'Removed' : 'Would remove'}: "${product.name}" (${product.prices} price, ${product.deals} deal rows) — ${product.reason}`)
  for (const product of report.keptInUse) console.log(`Kept, in use by a household or another source: "${product.name}" — ${product.reason}`)
  console.log(apply ? `Applied: ${report.removed.length} removed.` : `Dry run: ${report.removed.length} would be removed. Nothing changed.`)
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
