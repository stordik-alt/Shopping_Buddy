import { applyReclassification, planReclassification, type CategoryGuess, type Move } from '@/lib/db/reclassify'

// Re-places rows that already have a subcategory by the current keyword rules, and gives old
// purchase lines without a category one where the evidence is clear (lib/db/reclassify.ts).
//
// Dry run by default: reports what WOULD change, writes nothing.
//   pnpm db:reclassify-products            (dry run)
//   pnpm db:reclassify-products --apply    (writes)

function report(label: string, moves: Move[]) {
  const counts = new Map<string, number>()
  for (const move of moves) {
    const key = `${move.category}: ${move.from ?? '(none)'} → ${move.to ?? '(none)'}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  console.log(`\n${label}: ${moves.length}`)
  for (const [change, count] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`    ${String(count).padStart(5)}  ${change}`)
  for (const move of moves.slice(0, 15)) console.log(`      e.g. ${move.name} — ${move.from ?? '(none)'} → ${move.to ?? '(none)'}`)
}

function reportCategories(guesses: CategoryGuess[]) {
  console.log(`\nOld purchase lines without a category: ${guesses.length} get one`)
  for (const guess of guesses) console.log(`    ${guess.name} — ${guess.category}${guess.subcategory ? ` ▸ ${guess.subcategory}` : ''} (${guess.evidence === 'catalog' ? 'catalog product of that name' : 'keyword rules'})`)
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(apply ? 'Re-classification — WRITING to the database in .env.local' : 'Re-classification dry run — nothing is written (pass --apply to write)')
  const plan = await planReclassification()
  report('Products (catalog)', plan.products)
  report('Purchase lines', plan.purchaseItems)
  report('Pantry (Zásoby) rows', plan.pantryItems)
  reportCategories(plan.lineCategories)
  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write these changes.')
    return
  }
  const done = await applyReclassification(plan)
  console.log(
    `\nDone: ${done.products} products, ${done.purchaseItems} purchase lines, ${done.pantryItems} pantry rows, ${done.lineCategories} line categories; ${done.purchasesRecomputed} purchases recomputed.`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
