import { describeError } from '@/lib/errors'
import {
  createAlbertConnector,
  dbFlyerPageCache,
  fetchAlbertOffers,
  geminiFlyerExtractor,
  validateAlbertOffer,
  type AlbertLocationType,
  type FlyerPageCache,
  type FlyerPageExtractor,
} from '@/lib/ingestion/albert'
import { ingestPrices } from '@/lib/ingestion/ingest'
import { ingestionDate } from '@/lib/ingestion/today'

// Reads Albert's current flyers with the model and shows, offer by offer, what was read and what the
// validator accepted or rejected (and why) — the way to check the model's accuracy on real flyers
// before trusting it, and to fill the deals without waiting for the cron.
//
// Dry run by default: the model is called, nothing is written (not even the page cache). --apply
// runs the cron's own pipeline: pages go to the `flyer_pages` cache, offers to `deals`.
//   pnpm db:albert-flyers --pages 3            (dry run, 3 pages per format — a cheap accuracy check)
//   pnpm db:albert-flyers sm                   (dry run, the whole supermarket flyer)
//   pnpm db:albert-flyers --apply              (both formats, writes)

const FORMATS: Record<string, { chain: string; locationType: AlbertLocationType }> = {
  sm: { chain: 'Albert', locationType: 'SUPERMARKET' },
  hm: { chain: 'Albert Hypermarket', locationType: 'HYPERMARKET' },
}

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply')
  const pagesIndex = argv.indexOf('--pages')
  const maxNewPages = pagesIndex >= 0 ? Number(argv[pagesIndex + 1]) : undefined
  if (maxNewPages !== undefined && (!Number.isInteger(maxNewPages) || maxNewPages <= 0)) throw new Error('--pages needs a positive whole number')
  const names = argv.filter((arg, i) => !arg.startsWith('--') && !(pagesIndex >= 0 && i === pagesIndex + 1))
  const formats = names.length === 0 ? Object.keys(FORMATS) : names
  const unknown = formats.filter((name) => !FORMATS[name])
  if (unknown.length > 0) throw new Error(`Unknown format: ${unknown.join(', ')}. Known: ${Object.keys(FORMATS).join(', ')}`)
  return { apply, maxNewPages, formats }
}

/** Counts the model's tokens across the run (the only paid step). */
function countingExtractor(totals: { pages: number; input: number; output: number }): FlyerPageExtractor {
  return {
    model: geminiFlyerExtractor.model,
    async extract(page) {
      const result = await geminiFlyerExtractor.extract(page)
      totals.pages++
      totals.input += result.inputTokens ?? 0
      totals.output += result.outputTokens ?? 0
      return result
    },
  }
}

// The dry run's cache: nothing cached, nothing kept.
const noCache: FlyerPageCache = { load: async () => new Map(), save: async () => {}, prune: async () => {} }

async function main() {
  const { apply, maxNewPages, formats } = parseArgs(process.argv.slice(2))
  console.log(apply ? 'Albert flyers — WRITING to the database in .env.local' : 'Albert flyers dry run — nothing is written (pass --apply to write)')
  const today = ingestionDate()
  const totals = { pages: 0, input: 0, output: 0 }
  const extractor = countingExtractor(totals)
  let failed = false

  for (const name of formats) {
    const { chain, locationType } = FORMATS[name]
    console.log(`\n${chain} (${locationType})`)
    try {
      if (apply) {
        const connector = createAlbertConnector(chain, locationType, { extractor, cache: dbFlyerPageCache, maxNewPages })
        const result = await ingestPrices(connector, 1_000_000)
        console.log(`  ${result.processed} offers, ${result.deals} deals written, ${result.newProducts} new products, ${result.recorded} regular prices, ${result.skipped} rejected`)
        for (const error of result.errors.slice(0, 10)) console.log(`  error: ${error}`)
      } else {
        const raws = await fetchAlbertOffers(locationType, { extractor, cache: noCache, maxNewPages, today })
        let accepted = 0
        for (const raw of raws) {
          const result = validateAlbertOffer(raw, today)
          const where = `p.${raw.pageNumber}`
          if ('product' in result) {
            accepted++
            const { product } = result
            const regular = product.regularPrice != null ? ` (dříve ${product.regularPrice})` : ''
            console.log(`  ✓ ${where} ${product.name} — ${product.deal?.dealPrice} Kč${regular}, ${product.deal?.unitPrice} Kč/${product.unit} [${product.category}]`)
          } else {
            console.log(`  ✗ ${where} ${[raw.offer.brand, raw.offer.name, raw.offer.packageSize].filter(Boolean).join(' ')} — ${raw.offer.offerPrice ?? '?'} Kč: ${result.rejected}`)
          }
        }
        console.log(`  ${raws.length} offers read, ${accepted} accepted, ${raws.length - accepted} rejected`)
      }
    } catch (err) {
      failed = true
      console.error(`  failed:`, describeError(err))
    }
  }
  console.log(`\nModel: ${totals.pages} pages, ${totals.input} input + ${totals.output} output tokens`)
  if (failed) process.exitCode = 1
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((err) => {
  console.error(describeError(err))
  process.exit(1)
})
