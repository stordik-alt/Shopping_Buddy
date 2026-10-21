import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { importTetaCatalog, readTetaCatalogProducts, TETA_SOURCE } from '@/lib/ingestion/teta-import'

// Reports which Teta products can be linked to a catalog product the app already knows, and which
// ones need a human to look at them.
//
//   pnpm product:identity-teta-catalog
//
// Nothing is written to the database: this is the dry run of the import, and its output is the
// review file. A link is made only where the evidence is unambiguous — the same brand, the same
// package, the same descriptive words, no conflicting token and no second candidate that is just
// as close (lib/product-identity-teta.ts).

function arg(name: string): string | undefined
function arg(name: string, fallback: string): string
function arg(name: string, fallback?: string): string | undefined {
  const value = process.argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3)
  return value ?? fallback
}

async function main(): Promise<void> {
  const listingPath = arg('listing', 'data/external/teta-catalog-listing.ndjson')
  const detailPath = arg('detail', 'data/external/teta-catalog-detail.ndjson')
  const reviewPath = arg('review', 'data/external/teta-identity-review.json')

  const records = await readTetaCatalogProducts(listingPath, detailPath)
  console.log(`[teta-identity] ${records.length} products read`)

  const result = await importTetaCatalog(records, { apply: false })

  await mkdir(dirname(reviewPath), { recursive: true })
  await writeFile(reviewPath, JSON.stringify({
    source: TETA_SOURCE,
    generatedAt: new Date().toISOString(),
    apply: false,
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
    products: result.records,
    decisions: result.decisions,
    reviewFile: reviewPath,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
