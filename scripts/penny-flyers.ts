import { describeError } from '@/lib/errors'
import { fetchFlyerOffers, validateFlyerOffer, type FlyerPageCache, type FlyerPageExtractor } from '@/lib/ingestion/flyer'
import { fetchWithTimeout } from '@/lib/ingestion/http'
import { ingestPrices } from '@/lib/ingestion/ingest'
import { createPennyFlyerConnector, PENNY_VALIDATION, pennyFlyerCache, pennyFlyerExtractor, pennyFlyerSource } from '@/lib/ingestion/penny-flyer'
import { ingestionDate } from '@/lib/ingestion/today'

// Reads Penny's current flyer with the model and shows, offer by offer, what was read and what the
// validator accepted or rejected (and why) — the way to check the model's accuracy on a real flyer
// before trusting it, and to fill the deals without waiting for the cron.
//
// Dry run by default: the model is called, nothing is written (not even the page cache). --apply
// runs the cron's own pipeline: pages go to the `flyer_pages` cache, offers to `deals`.
//   pnpm db:penny-flyers --pages 3     (dry run, 3 pages — a cheap accuracy check)
//   pnpm db:penny-flyers               (dry run, the whole flyer)
//   pnpm db:penny-flyers --apply       (writes)

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply')
  const pagesIndex = argv.indexOf('--pages')
  const maxNewPages = pagesIndex >= 0 ? Number(argv[pagesIndex + 1]) : undefined
  if (maxNewPages !== undefined && (!Number.isInteger(maxNewPages) || maxNewPages <= 0)) throw new Error('--pages needs a positive whole number')
  return { apply, maxNewPages }
}

/** Counts the model's tokens across the run (the only paid step). */
function countingExtractor(totals: { pages: number; input: number; output: number }): FlyerPageExtractor {
  return {
    model: pennyFlyerExtractor.model,
    async extract(page) {
      const result = await pennyFlyerExtractor.extract(page)
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
  const { apply, maxNewPages } = parseArgs(process.argv.slice(2))
  console.log(apply ? 'Penny flyer — WRITING to the database in .env.local' : 'Penny flyer dry run — nothing is written (pass --apply to write)')
  const today = ingestionDate()
  const totals = { pages: 0, input: 0, output: 0 }
  const extractor = countingExtractor(totals)

  // Which pages are read, and which are left out because some of their offers hold on other days.
  for (const flyer of await pennyFlyerSource.listFlyers(fetchWithTimeout, today)) {
    console.log(`\nFlyer ${flyer.id}: ${flyer.validFrom} – ${flyer.validUntil}, ${flyer.pages.length} pages to read`)
    for (const page of flyer.skippedPages) console.log(`  page ${page.number} left out: ${page.reason}`)
  }

  if (apply) {
    const connector = createPennyFlyerConnector({ extractor, cache: pennyFlyerCache, maxNewPages })
    const result = await ingestPrices(connector, 1_000_000)
    console.log(`\n${result.processed} offers, ${result.deals} deals written, ${result.newProducts} new products, ${result.recorded} regular prices, ${result.skipped} rejected`)
    for (const error of result.errors.slice(0, 10)) console.log(`  error: ${error}`)
  } else {
    const raws = await fetchFlyerOffers(pennyFlyerSource, () => true, { extractor, cache: noCache, maxNewPages, today })
    let accepted = 0
    console.log('')
    for (const raw of raws) {
      const result = validateFlyerOffer(raw, today, PENNY_VALIDATION)
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
    console.log(`\n${raws.length} offers read, ${accepted} accepted, ${raws.length - accepted} rejected`)
  }
  console.log(`Model: ${totals.pages} pages, ${totals.input} input + ${totals.output} output tokens`)
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(describeError(err))
  process.exit(1)
})
