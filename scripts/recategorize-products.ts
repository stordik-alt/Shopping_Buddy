import {
  applyLineCategoryFill,
  applyLineItemRecategorization,
  applyProductRecategorization,
  previewLineCategoryFill,
  previewLineItemRecategorization,
  previewProductRecategorization,
  type RecategorizePreview,
} from '@/lib/db/recategorize'

// Historical re-categorization (spec sections 19-20): fills in the new subcategory column for
// products, purchase history and pantry rows written before this feature (or where the pipeline
// couldn't place them confidently at the time), and the category of old purchase lines linked to a
// catalog product. Never touches raw OCR/receipt data, never overwrites a subcategory or category
// that is already set — only ever fills a currently-empty one.
//
// Dry run by default: reports what WOULD change, writes nothing.
//   pnpm db:recategorize-products            (dry run)
//   pnpm db:recategorize-products --apply    (writes)

function report(label: string, preview: RecategorizePreview) {
  console.log(`\n${label}: ${preview.totalCandidates} without one, ${preview.resolvable} resolvable now`)
  for (const sample of preview.samples) console.log(`    ${sample.name} — ${sample.category} ▸ ${sample.subcategory}`)
  if (preview.resolvable > preview.samples.length) console.log(`    … and ${preview.resolvable - preview.samples.length} more`)
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(apply ? 'Re-categorization — WRITING to the database in .env.local' : 'Re-categorization dry run — nothing is written (pass --apply to write)')

  report('Purchase lines without a category (taken from their linked product)', await previewLineCategoryFill())
  report('Products (catalog) without a subcategory', await previewProductRecategorization())
  report('Purchase history lines without a subcategory', await previewLineItemRecategorization('purchase_items'))
  report('Pantry (Zásoby) rows without a subcategory', await previewLineItemRecategorization('pantry_items'))

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write these changes.')
    return
  }

  // Categories first, products next: a line can then take its product's newly found subcategory.
  const categories = await applyLineCategoryFill()
  const products = await applyProductRecategorization()
  const purchaseItems = await applyLineItemRecategorization('purchase_items')
  const pantryItems = await applyLineItemRecategorization('pantry_items')
  console.log(`\nDone: ${categories} purchase-line categories, ${products} products, ${purchaseItems} purchase lines, ${pantryItems} pantry rows updated.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
