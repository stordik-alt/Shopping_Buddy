import {
  applyLineItemRecategorization,
  applyProductRecategorization,
  previewLineItemRecategorization,
  previewProductRecategorization,
  type RecategorizePreview,
} from '@/lib/db/recategorize'

// Historical re-categorization (spec sections 19-20): fills in the new subcategory column for
// products, purchase history and pantry rows written before this feature (or where the pipeline
// couldn't place them confidently at the time). Never touches raw OCR/receipt data, never
// overwrites a subcategory that is already set — only ever fills a currently-empty one.
//
// Dry run by default: reports what WOULD change, writes nothing.
//   pnpm tsx scripts/recategorize-products.ts            (dry run)
//   pnpm tsx scripts/recategorize-products.ts --apply     (writes)

function report(label: string, preview: RecategorizePreview) {
  console.log(`\n${label}: ${preview.totalCandidates} without a subcategory, ${preview.resolvable} resolvable now`)
  for (const sample of preview.samples) console.log(`    ${sample.name} — ${sample.category} ▸ ${sample.subcategory}`)
  if (preview.resolvable > preview.samples.length) console.log(`    … and ${preview.resolvable - preview.samples.length} more`)
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(apply ? 'Re-categorization — WRITING to the database in .env.local' : 'Re-categorization dry run — nothing is written (pass --apply to write)')

  report('Products (catalog)', await previewProductRecategorization())
  report('Purchase history lines', await previewLineItemRecategorization('purchase_items'))
  report('Pantry (Zásoby) rows', await previewLineItemRecategorization('pantry_items'))

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write these changes.')
    return
  }

  const products = await applyProductRecategorization()
  const purchaseItems = await applyLineItemRecategorization('purchase_items')
  const pantryItems = await applyLineItemRecategorization('pantry_items')
  console.log(`\nDone: ${products} products, ${purchaseItems} purchase lines, ${pantryItems} pantry rows updated.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
