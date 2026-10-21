import { fetchTetaPublicHtml, htmlToTetaText } from '@/lib/ingestion/teta-public-html'
import { readTetaCatalogRecords } from '@/lib/ingestion/teta-collector'
import type { TetaCatalogProduct } from '@/lib/ingestion/teta-catalog'

// Checks that what the collector read is what the shop actually shows.
//
//   pnpm teta:verify-rendering
//
// The collector reads the Nuxt payload of the public product page. That payload is the data the
// page renders from, but "it decodes" is not the same as "it is what the shopper sees": a field
// could be decoded from the wrong slot, or the payload could carry a price the page never shows.
//
// So a sample of product pages is read again and compared with the collected record: the name, the
// everyday price, the action price, the brand and the package size have to appear in the text of
// the rendered page. A browser is not needed for that — the server-rendered HTML carries the same
// text, and a headless browser would only add the requests for the site's own scripts, which
// robots.txt disallows.
//
// The pages are read with the same rules as the collection: robots.txt is honoured, the requests
// are identified and at most one per second goes out.

function arg(name: string, fallback: string): string
function arg(name: string, fallback?: string): string | undefined {
  const value = process.argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3)
  return value ?? fallback
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

/** The text as the comparison reads it: case, diacritics and spacing do not matter. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase('cs-CZ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** The price as the retailer writes it: "59,90 Kč", "1 999,90 Kč" — the thousands group may be
 *  written with a space, a non-breaking space or a narrow one. */
export function priceAppearsIn(text: string, amount: number): boolean {
  const [whole, fraction] = amount.toFixed(2).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '[\\s\\u00a0\\u202f]?')
  return new RegExp(`${grouped}\\s*[,.]\\s*${fraction}\\s*Kč`, 'i').test(text)
}

/** The records to check: a sample spread over the collected file, so the sample is not only the
 *  first pages of one category. */
function pickSample(records: TetaCatalogProduct[], count: number): TetaCatalogProduct[] {
  if (records.length <= count) return records
  const step = records.length / count
  const sample: TetaCatalogProduct[] = []
  for (let index = 0; index < count; index++) {
    sample.push(records[Math.floor(index * step)])
  }
  return sample
}

type Check = { field: string; ok: boolean; detail?: string }

async function checkRecord(record: TetaCatalogProduct): Promise<Check[]> {
  const html = await fetchTetaPublicHtml(record.url)
  const text = htmlToTetaText(html)
  const flat = normalizeText(text)
  const checks: Check[] = []

  const name = normalizeText(record.name)
  checks.push({ field: 'name', ok: flat.includes(name) })
  checks.push({ field: 'everyday price', ok: priceAppearsIn(text, record.regularPrice ?? record.price) })
  if (record.regularPrice !== undefined && record.regularPrice > record.price) {
    checks.push({ field: 'action price', ok: priceAppearsIn(text, record.price) })
  }
  if (record.brand) {
    const brand = normalizeText(record.brand)
    checks.push({ field: 'brand', ok: flat.includes(brand) })
  }
  if (record.packageText) {
    const packageText = normalizeText(record.packageText)
    checks.push({ field: 'package', ok: flat.includes(packageText) })
  }
  return checks
}

async function main(): Promise<void> {
  const recordsPath = arg('records', 'data/external/teta-catalog-detail.ndjson')
  const count = Number(arg('count', '12'))
  if (!Number.isFinite(count) || count <= 0) throw new Error(`Invalid --count: ${arg('count', '')}`)

  const records = await readTetaCatalogRecords(recordsPath)
  const all = [...records.values()].filter((record): record is TetaCatalogProduct => record !== null)
  if (all.length === 0) throw new Error(`No records in ${recordsPath}`)

  const sample = pickSample(all, count)
  console.log(`[teta-verify] ${all.length} records in ${recordsPath}, ${sample.length} checked`)

  let failed = 0
  for (const record of sample) {
    let checks: Check[]
    try {
      checks = await checkRecord(record)
    } catch (error) {
      failed += 1
      console.log(`✗ ${record.externalId} ${record.name} — ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    const broken = checks.filter((check) => !check.ok)
    if (broken.length > 0) failed += 1
    console.log(
      `${broken.length === 0 ? '✓' : '✗'} ${record.externalId} ${record.name}`
      + (broken.length === 0 ? '' : ` — not on the page: ${broken.map((check) => check.field).join(', ')}`),
    )
  }

  console.log(`[teta-verify] ${sample.length - failed} of ${sample.length} records match the rendered page`)
  if (failed > 0 && !hasFlag('allow-failures')) process.exitCode = 1
}

// Spuští se jen při přímém volání skriptu, ne při importu v testu.
if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
