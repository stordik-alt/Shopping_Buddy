import { applyNewSubcategoryMoves, planNewSubcategoryMoves, type SubcategoryMove } from '@/lib/db/new-subcategories'

// Moves products, purchase lines and pantry rows into the Potraviny subcategories added on
// 2026-10-03 (lib/db/new-subcategories.ts), and recomputes the budget expenses of every purchase
// with a moved line.
//
// Dry run by default: reports what WOULD change, writes nothing.
//   pnpm db:move-new-subcategories            (dry run)
//   pnpm db:move-new-subcategories --apply    (writes)

function report(label: string, moves: SubcategoryMove[]) {
  const counts = new Map<string, number>()
  for (const move of moves) counts.set(`${move.from ?? '(none)'} → ${move.to}`, (counts.get(`${move.from ?? '(none)'} → ${move.to}`) ?? 0) + 1)
  console.log(`\n${label}: ${moves.length}`)
  for (const [change, count] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`    ${String(count).padStart(5)}  ${change}`)
  for (const move of moves.slice(0, 15)) console.log(`      e.g. ${move.name} — ${move.from ?? '(none)'} → ${move.to}`)
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(apply ? 'Moving into the new subcategories — WRITING to the database in .env.local' : 'Dry run — nothing is written (pass --apply to write)')
  const plan = await planNewSubcategoryMoves()
  report('Products (catalog)', plan.products)
  report('Purchase lines', plan.purchaseItems)
  report('Pantry (Zásoby) rows', plan.pantryItems)
  console.log(`\nPurchases whose expenses would be recomputed: ${new Set(plan.purchaseItems.map((item) => item.purchaseId)).size}`)
  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write these changes.')
    return
  }
  const done = await applyNewSubcategoryMoves(plan)
  console.log(`\nDone: ${done.products} products, ${done.purchaseItems} purchase lines, ${done.pantryItems} pantry rows moved; ${done.purchasesRecomputed} purchases recomputed.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
