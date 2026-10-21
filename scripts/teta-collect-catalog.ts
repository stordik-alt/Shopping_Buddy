import {
  collectTetaDetails,
  collectTetaListings,
  readTetaSlugs,
} from '@/lib/ingestion/teta-collector'

// Collects Teta's public online catalog into NDJSON files. Two runs:
//
//   pnpm teta:collect -- --mode=list --limit=50
//   pnpm teta:collect -- --mode=detail --limit=500
//
// The state file makes both runs resumable: a run that was interrupted continues where it
// stopped, and `--limit` splits the work into chunks that fit a CI job. Nothing is written to the
// database here — the import is a separate, explicit step.

function arg(name: string): string | undefined
function arg(name: string, fallback: string): string
function arg(name: string, fallback?: string): string | undefined {
  const value = process.argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3)
  return value ?? fallback
}

function numberArg(name: string): number | undefined {
  const value = arg(name)
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid --${name}: ${value}`)
  return parsed
}

async function main(): Promise<void> {
  const mode = arg('mode', 'list')
  const listingPath = arg('listing', 'data/external/teta-catalog-listing.ndjson')
  const detailPath = arg('detail', 'data/external/teta-catalog-detail.ndjson')
  const statePath = arg('state', 'data/external/teta-collect-state.json')
  const limit = numberArg('limit')
  const log = (message: string) => console.log(`[teta-collect] ${message}`)

  if (mode === 'list') {
    // A run can be narrowed to a few categories, which is how the CI workflow splits the walk.
    const categories = arg('categories')?.split(',').map((value) => value.trim()).filter(Boolean)
    const result = await collectTetaListings({
      outputPath: listingPath,
      statePath,
      ...(categories && categories.length > 0 ? { categories } : {}),
      ...(limit === undefined ? {} : { limit }),
      log,
    })
    console.log(JSON.stringify({
      mode,
      pages: result.pages,
      products: result.products,
      failures: result.failures.length,
      outputPath: listingPath,
      statePath,
    }, null, 2))
    if (result.failures.length > 0) {
      console.error(result.failures.slice(0, 20).join('\n'))
      process.exitCode = 1
    }
    return
  }

  if (mode === 'detail') {
    const slugs = await readTetaSlugs(listingPath)
    const result = await collectTetaDetails({
      outputPath: detailPath,
      statePath,
      slugs,
      ...(limit === undefined ? {} : { limit }),
      log,
    })
    console.log(JSON.stringify({
      mode,
      slugs: slugs.length,
      products: result.products,
      failures: result.failures.length,
      outputPath: detailPath,
      statePath,
    }, null, 2))
    if (result.failures.length > 0) {
      console.error(result.failures.slice(0, 20).join('\n'))
      process.exitCode = 1
    }
    return
  }

  throw new Error(`Unknown --mode=${mode}; use "list" or "detail"`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
