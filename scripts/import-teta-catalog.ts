import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { describeError } from '@/lib/errors'
import { importTetaCatalog, readTetaCatalogProducts, TETA_SOURCE } from '@/lib/ingestion/teta-import'

// Imports Teta's collected catalog into the app's database.
//
//   pnpm db:import-teta                 # dry run: reports what would be written
//   pnpm db:import-teta -- --apply      # writes
//
// Two collected files are read: the category listings (price, stock, name) and the product pages
// (package size, brand, description). A product that is in both is written once, with what the
// product page knows added to what the listing knows.
//
// The dry run is the default, and it is also the report: the products whose identity is not
// unambiguous are written to the review file for a human to look at.

function arg(name: string): string | undefined
function arg(name: string, fallback: string): string
function arg(name: string, fallback?: string): string | undefined {
  const value = process.argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3)
  return value ?? fallback
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function numberArg(name: string, fallback: number): number {
  const value = arg(name)
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid --${name}: ${value}`)
  return Math.floor(parsed)
}

async function main(): Promise<void> {
  const apply = hasFlag('apply')
  const listingPath = arg('listing', 'data/external/teta-catalog-listing.ndjson')
  const detailPath = arg('detail', 'data/external/teta-catalog-detail.ndjson')
  const reviewPath = arg('review', 'data/external/teta-identity-review.json')
  const batchSize = numberArg('batch', 500)

  const records = await readTetaCatalogProducts(listingPath, detailPath)
  console.log(`[teta-import] ${records.length} products read (${listingPath}, ${detailPath})`)

  const result = await importTetaCatalog(records, { apply, batchSize })

  // The review file: the products whose identity needs a human, with the candidates and the
  // reason each automatic link was refused.
  await mkdir(dirname(reviewPath), { recursive: true })
  await writeFile(reviewPath, JSON.stringify({
    source: TETA_SOURCE,
    generatedAt: new Date().toISOString(),
    apply,
    decisions: result.decisions,
    products: result.review.map((decision) => ({
      externalId: decision.externalId,
      name: decision.name,
      reason: decision.reason,
      score: decision.score,
      candidates: decision.candidates,
    })),
  }, null, 2) + '\n', 'utf8')

  console.log(JSON.stringify({
    apply,
    records: result.records,
    skipped: result.skipped,
    products: result.products,
    decisions: result.decisions,
    packages: result.packages,
    tradeItems: result.tradeItems,
    retailerRefs: result.retailerRefs,
    prices: result.prices,
    actionPrices: result.actionPrices,
    errors: result.errors.length,
    reviewFile: reviewPath,
  }, null, 2))

  if (result.errors.length > 0) {
    console.error(result.errors.slice(0, 20).map((error) => `${error.externalId}: ${error.message}`).join('\n'))
  }
  if (!apply) {
    console.log('[teta-import] Dry run — nothing was written. Add --apply to write.')
  }
}

main().catch((error) => {
  // The whole cause chain: a database error is wrapped by the query layer, and the reason it
  // gives (which constraint, which value) is in the cause, not in the wrapper's message.
  console.error(describeError(error))
  process.exitCode = 1
})
