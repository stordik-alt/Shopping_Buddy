import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyProductTypeAssignment, loadProductTypeIds, planProductTypeAssignment, type ProductTypeMove } from '@/lib/db/product-type-assignment'
import { PRODUCT_TYPES } from '@/lib/product-types'

// Guarded roll-out of the product-type rules to the catalog (docs/12_PRODUCT_TYPES.md, seed batches).
// It wraps the same plan/apply as `pnpm db:assign-product-types` and adds what a bulk production write
// needs: a dry run by default, a check that every type of the code exists in `product_types`, the
// database host named on the command line, a cap on removals, a JSON backup, and a rollback.
//
//   pnpm db:apply-product-types-batch                                  dry run: summary + report file
//   pnpm db:apply-product-types-batch --apply --confirm-host=<host>    writes (host must match DATABASE_URL)
//   pnpm db:apply-product-types-batch --rollback=<backup.json> --apply --confirm-host=<host>
//
// Options: --types=a,b   only moves to or from these types
//          --max-removals=N   abort when more rule-made types would be taken away (default 150)
// Types set by a person ('manual') or by a confirmed receipt match ('alias') are never touched: the
// plan only reads unset or rule-made rows and each UPDATE re-checks that.

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const value = (name: string) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)

/** The host of DATABASE_URL, never the credentials. */
function databaseHost(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set (run through `pnpm db:apply-product-types-batch`, which loads .env.local).')
  return new URL(url).host
}

function summarize(moves: ProductTypeMove[]): { assigned: Map<string, number>; changed: Map<string, number>; removed: Map<string, number> } {
  const assigned = new Map<string, number>()
  const changed = new Map<string, number>()
  const removed = new Map<string, number>()
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1)
  for (const move of moves) {
    if (move.to && !move.from) bump(assigned, move.to)
    else if (move.to && move.from) bump(changed, `${move.from} → ${move.to}`)
    else if (move.from) bump(removed, move.from)
  }
  return { assigned, changed, removed }
}

const print = (title: string, map: Map<string, number>) => {
  console.log(`\n${title}: ${[...map.values()].reduce((a, b) => a + b, 0)}`)
  for (const [key, count] of [...map].sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(6)}  ${key}`)
}

async function main() {
  const apply = flag('--apply')
  const host = databaseHost()
  console.log(`Database host: ${host}`)
  if (apply && value('--confirm-host') !== host) {
    throw new Error(`--apply needs --confirm-host=${host} (the host of DATABASE_URL), so a write never goes to an unintended database.`)
  }

  // The plan only ever assigns types that have a row; a missing row would silently skip a whole batch.
  const typeIds = await loadProductTypeIds()
  const missing = PRODUCT_TYPES.filter((type) => !typeIds.has(type.key)).map((type) => type.key)
  if (missing.length > 0) {
    throw new Error(`product_types is missing ${missing.length} type(s) of the code: ${missing.join(', ')}. Run the migrations first (pnpm db:migrate).`)
  }

  const rollbackFile = value('--rollback')
  let moves: ProductTypeMove[]
  if (rollbackFile) {
    // A backup holds the moves that were applied; rolling back swaps from and to. The UPDATE still
    // checks that the row has the type the original run gave it, so later corrections survive.
    const backup = JSON.parse(readFileSync(resolve(rollbackFile), 'utf8')) as { moves: ProductTypeMove[] }
    moves = backup.moves.map((move) => ({ ...move, from: move.to, to: move.from }))
    console.log(`Rollback of ${backup.moves.length} moves from ${rollbackFile}`)
  } else {
    moves = await planProductTypeAssignment()
    const only = value('--types')?.split(',').filter(Boolean)
    if (only) moves = moves.filter((move) => (move.to && only.includes(move.to)) || (move.from && only.includes(move.from)))
  }

  const { assigned, changed, removed } = summarize(moves)
  print('Newly assigned (none → type)', assigned)
  print('Changed (type → type)', changed)
  print('Removed (type → none)', removed)
  const removals = [...removed.values()].reduce((a, b) => a + b, 0)
  console.log(`\nTotal moves: ${moves.length}`)

  mkdirSync(resolve('.tmp'), { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = resolve('.tmp', `product-types-${apply ? 'applied' : 'plan'}-${stamp}.json`)
  writeFileSync(reportPath, `${JSON.stringify({ host, createdAt: new Date().toISOString(), apply, moves }, null, 2)}\n`)
  console.log(`Report${apply ? ' (backup, needed for --rollback)' : ''}: ${reportPath}`)

  if (!apply) {
    console.log('\nDry run only. Nothing was written.')
    return
  }
  const maxRemovals = Number(value('--max-removals') ?? 150)
  if (!rollbackFile && removals > maxRemovals) {
    throw new Error(`${removals} rule-made types would be removed (limit ${maxRemovals}). Inspect the dry run, or raise --max-removals.`)
  }
  const updated = await applyProductTypeAssignment(moves)
  console.log(`\nDone: ${updated} of ${moves.length} products updated (the rest changed since the plan, or were set by a person).`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
