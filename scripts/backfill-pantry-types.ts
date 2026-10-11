import { applyPantryTypeBackfill, planPantryTypeBackfill } from '@/lib/db/pantry-type-backfill'

// Gives older pantry rows (zásoby) their product type (druh zboží) so recipes can match them
// (lib/db/pantry-type-backfill.ts). Writes only `product_type_id`; never renames or merges rows, and
// never touches a row that already has a type.
//
// Dry run by default: reports what WOULD change, writes nothing.
//   pnpm db:backfill-pantry-types            (dry run)
//   pnpm db:backfill-pantry-types --apply    (writes)

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(apply ? 'Pantry types — WRITING to the database in .env.local' : 'Pantry types dry run — nothing is written (pass --apply to write)')
  const { assignments, unplaced } = await planPantryTypeBackfill()
  const counts = new Map<string, number>()
  for (const assignment of assignments) counts.set(assignment.typeKey, (counts.get(assignment.typeKey) ?? 0) + 1)
  console.log(`\nRows that get a type: ${assignments.length} (${assignments.filter((a) => a.fromProduct).length} from their product)`)
  for (const [key, count] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`    ${String(count).padStart(5)}  ${key}`)
  for (const assignment of assignments.slice(0, 20)) console.log(`      e.g. ${assignment.name} → ${assignment.typeKey}`)
  console.log(`\nRows the rules cannot place (left as they are): ${unplaced.length}`)
  for (const row of unplaced.slice(0, 20)) console.log(`      e.g. ${row.name}`)
  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write these changes.')
    return
  }
  console.log(`\nDone: ${await applyPantryTypeBackfill(assignments)} rows updated.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
