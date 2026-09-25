import { describeError } from '@/lib/errors'
import { ingestPrices, PRICE_SOURCES } from '@/lib/ingestion/ingest'
import { billaConnector } from '@/lib/ingestion/billa'
import { dmConnector } from '@/lib/ingestion/dm'
import { globusConnector } from '@/lib/ingestion/globus'
import { kosikConnector } from '@/lib/ingestion/kosik'
import { lidlConnector } from '@/lib/ingestion/lidl'
import { pennyConnector } from '@/lib/ingestion/penny'
import { rohlikConnector } from '@/lib/ingestion/rohlik'
import { ingestionDate } from '@/lib/ingestion/today'
import type { PriceConnector } from '@/lib/ingestion/types'

// One-off initial fill of the product catalog and prices: reads each store's WHOLE catalog, not the
// daily cron's small stable batch. Runs on a developer machine, so it has no function time limit
// and can take as long as a full catalog needs (writes cost ~0.4 s per product from outside the
// database's region, so thousands of products take tens of minutes).
//
// It is the cron's own pipeline — the same connectors, validation and `ingestPrices()` persistence
// (idempotent per CLAUDE.md section 34: a product is keyed by the store's own id, and a repeat run
// the same day refreshes that day's price instead of adding one) — only with `fullCatalog` set and
// no deadline. The connectors keep their polite pacing (sequential requests with pauses).
//
// Dry run by default: fetches and validates, writes nothing. Pass --apply to write.
//   pnpm db:backfill-prices lidl billa              (dry run, two stores)
//   pnpm db:backfill-prices all --apply             (every store, writes)
//   pnpm db:backfill-prices dm --limit 200          (a smaller batch, e.g. to try it out)

// Each connector has its own raw type; the script only passes raw records back to the same connector.
const CONNECTORS: Record<string, PriceConnector<unknown>> = {
  lidl: lidlConnector,
  billa: billaConnector,
  penny: pennyConnector,
  dm: dmConnector,
  rohlik: rohlikConnector,
  kosik: kosikConnector,
  globus: globusConnector,
}

// "Everything": far above any store's catalog; the connectors stop at the catalog's end.
const UNLIMITED = 1_000_000

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply')
  const limitIndex = argv.indexOf('--limit')
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : UNLIMITED
  if (!Number.isInteger(limit) || limit <= 0) throw new Error('--limit needs a positive whole number')
  // Store names: every argument that is neither a flag nor the value after --limit.
  const names = argv.filter((arg, i) => !arg.startsWith('--') && !(limitIndex >= 0 && i === limitIndex + 1))
  const sources = names.includes('all') ? PRICE_SOURCES.map((entry) => entry.source) : names
  if (sources.length === 0) throw new Error(`Name the stores to fill (or "all"): ${Object.keys(CONNECTORS).join(', ')}`)
  const unknown = sources.filter((name) => !CONNECTORS[name])
  if (unknown.length > 0) throw new Error(`Unknown store: ${unknown.join(', ')}. Known: ${Object.keys(CONNECTORS).join(', ')}`)
  return { apply, limit, sources }
}

const minutes = (ms: number) => `${(ms / 60_000).toFixed(1)} min`

/** Fetch + validate only: how many products the store's catalog has and how many are usable. */
async function dryRun(connector: PriceConnector<unknown>, limit: number) {
  const raws = await connector.fetchProducts(limit, { fullCatalog: true })
  const today = ingestionDate()
  let usable = 0
  let deals = 0
  const examples: string[] = []
  for (const raw of raws) {
    const normalized = connector.normalize(raw, today)
    if (!normalized) continue
    usable++
    if (normalized.deal) deals++
    if (examples.length < 3) examples.push(`${normalized.name} — ${normalized.regularPrice ?? normalized.deal?.dealPrice} ${normalized.currency}`)
  }
  console.log(`  fetched ${raws.length}, usable ${usable} (${raws.length - usable} rejected by validation), with a dated deal ${deals}`)
  for (const example of examples) console.log(`    e.g. ${example}`)
}

async function main() {
  const { apply, limit, sources } = parseArgs(process.argv.slice(2))
  console.log(apply ? 'Backfill — WRITING to the database in .env.local' : 'Backfill dry run — nothing is written (pass --apply to write)')

  let failed = false
  for (const source of sources) {
    const connector = CONNECTORS[source]
    const startedAt = Date.now()
    console.log(`\n${source}: reading the whole catalog…`)
    try {
      if (!apply) {
        await dryRun(connector, limit)
      } else {
        let lastLogged = 0
        const result = await ingestPrices(connector, limit, {
          fullCatalog: true,
          onProgress: (done, total) => {
            // A line every 250 products (and at the end) — enough to see it moving without flooding.
            if (done - lastLogged >= 250 || done === total) {
              lastLogged = done
              console.log(`  ${done} / ${total} products (${minutes(Date.now() - startedAt)})`)
            }
          },
        })
        console.log(
          `  done: ${result.processed} fetched, ${result.newProducts} new products, ${result.recorded} prices recorded, ` +
            `${result.unchanged} unchanged, ${result.priceChanges} price changes, ${result.deals} deals, ${result.skipped} skipped`,
        )
        if (result.errors.length > 0) {
          console.log(`  ${result.errors.length} products failed:`)
          for (const error of result.errors.slice(0, 10)) console.log(`    ${error}`)
          if (result.errors.length > 10) console.log(`    … and ${result.errors.length - 10} more`)
        }
      }
    } catch (err) {
      // One store failing (site down, changed API) must not stop the others — same rule as the cron.
      failed = true
      console.error(`  ${source} failed:`, describeError(err))
    }
    console.log(`  ${minutes(Date.now() - startedAt)}`)
  }
  if (failed) process.exitCode = 1
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((err) => {
  console.error(describeError(err))
  process.exit(1)
})
