import { applyProductTypeAssignment, planProductTypeAssignment } from '@/lib/db/product-type-assignment'

// Assigns product types (druhy zboží, lib/product-types.ts) to catalog products, and re-evaluates
// the rule-made ones after the rules change (docs/12_PRODUCT_TYPES.md). Types set by a person are
// never touched.
//
// Dry run by default: reports what WOULD change, writes nothing.
//   pnpm db:assign-product-types            (dry run)
//   pnpm db:assign-product-types --apply    (writes)

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(apply ? 'Product types — WRITING to the database in .env.local' : 'Product types dry run — nothing is written (pass --apply to write)')
  const moves = await planProductTypeAssignment()
  const counts = new Map<string, number>()
  for (const move of moves) counts.set(`${move.from ?? '(none)'} → ${move.to ?? '(none)'}`, (counts.get(`${move.from ?? '(none)'} → ${move.to ?? '(none)'}`) ?? 0) + 1)
  console.log(`\nProducts: ${moves.length}`)
  for (const [change, count] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`    ${String(count).padStart(5)}  ${change}`)
  for (const move of moves.slice(0, 20)) console.log(`      e.g. ${move.name} — ${move.from ?? '(none)'} → ${move.to ?? '(none)'}`)
  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write these changes.')
    return
  }
  console.log(`\nDone: ${await applyProductTypeAssignment(moves)} products updated.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
