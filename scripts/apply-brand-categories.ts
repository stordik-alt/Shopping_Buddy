import { applyBrandCategoryMoves, planBrandCategoryMoves } from '@/lib/db/brand-categories'

// Moves catalog products to the category their brand gives (lib/db/brand-categories.ts). Run
// `pnpm db:reclassify-products` afterwards, so the subcategories of the products that stayed in
// their category follow the brand rules too.
//
// Dry run by default: reports what WOULD change, writes nothing.
//   pnpm db:brand-categories            (dry run)
//   pnpm db:brand-categories --apply    (writes)

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(apply ? 'Brand categories — WRITING to the database in .env.local' : 'Brand categories dry run — nothing is written (pass --apply to write)')
  const moves = await planBrandCategoryMoves()
  const counts = new Map<string, number>()
  for (const move of moves) {
    const key = `${move.brand}: ${move.from} → ${move.to}${move.subcategory ? ` ▸ ${move.subcategory}` : ''}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  console.log(`\nProducts to move: ${moves.length}`)
  for (const [change, count] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`    ${String(count).padStart(5)}  ${change}`)
  for (const move of moves.slice(0, 20)) console.log(`      e.g. ${move.name} — ${move.from} → ${move.to}${move.subcategory ? ` ▸ ${move.subcategory}` : ''}`)
  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write these changes.')
    return
  }
  const done = await applyBrandCategoryMoves(moves)
  console.log(`\nDone: ${done.products} products, ${done.pantryItems} pantry rows; purchase lines synced for ${done.productsWithPurchases} products.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
