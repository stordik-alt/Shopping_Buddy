import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  fetchTetaPublicHtml,
  parseTetaCatalogLinks,
  parseTetaPublicProductPage,
  TETA_PUBLIC_CATALOG_URL,
  type TetaPublicPageProduct,
} from '@/lib/ingestion/teta-public-html'

function positiveIntegerArg(name: string, fallback: number): number {
  const prefix = `--${name}=`
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
  if (raw == null) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid ${name}: ${raw}`)
  return value
}

function stringArg(name: string, fallback: string): string {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
}

async function main(): Promise<void> {
  const pages = Math.min(positiveIntegerArg('pages', 1), 10)
  const maxProducts = Math.min(positiveIntegerArg('products', 20), 300)
  const delayMs = Math.max(1000, positiveIntegerArg('delay-ms', 1200))
  const outputPath = resolve(stringArg('out', 'data/external/teta-public-catalog-sample.json'))
  const startedAt = new Date().toISOString()
  const links = new Map<string, { url: string; slug: string }>()
  
  for (let page = 1; page <= pages; page++) {
    if (page > 1) await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs))
    const url = page === 1 ? TETA_PUBLIC_CATALOG_URL : `${TETA_PUBLIC_CATALOG_URL}?strana=${page}`
    console.log(`[Teta] catalog page ${page}/${pages}: ${url}`)
    const html = await fetchTetaPublicHtml(url)
    const pageLinks = parseTetaCatalogLinks(html)
    if (pageLinks.length === 0) {
      throw new Error(`No product detail links found on catalog page ${page}; refusing to write an empty/invalid dataset`)
    }
    for (const link of pageLinks) links.set(link.url, link)
    console.log(`[Teta] found ${pageLinks.length} detail links on page ${page}; ${links.size} unique total`)
  }
  
  const selected = [...links.values()].slice(0, maxProducts)
  const products: TetaPublicPageProduct[] = []
  for (const [index, link] of selected.entries()) {
    if (index > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs))
    console.log(`[Teta] detail ${index + 1}/${selected.length}: ${link.url}`)
    try {
      const html = await fetchTetaPublicHtml(link.url)
      products.push(parseTetaPublicProductPage(html, link.url))
    } catch (error) {
      products.push({
        url: link.url,
        prices: [],
        priceCandidates: [],
        categoryPath: [],
        missingFields: ['name', 'sourceCode', 'brand', 'ean', 'prices', 'categoryPath'],
        onlineAvailability: 'unknown' as const,
        extractionWarnings: [`fetch failed: ${error instanceof Error ? error.message : String(error)}`],
      })
    }
  }
  
  const dataset = {
    schemaVersion: 2,
    source: 'https://www.tetadrogerie.cz/eshop/produkty/vse',
    collectedAt: new Date().toISOString(),
    startedAt,
    mode: 'public-html-only',
    pageCountRequested: pages,
    uniqueCatalogLinksFound: links.size,
    productDetailsRequested: selected.length,
    note: 'Raw research dataset. Price roles are assigned only when visible page text supports the classification; conditional offers preserve their visible condition. Do not import prices into production without validation.',
    products,
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(dataset, null, 2) + '\n', 'utf8')
  const warningCount = products.reduce((sum, product) => sum + product.extractionWarnings.length, 0)
  console.log(JSON.stringify({
    outputPath,
    uniqueCatalogLinksFound: links.size,
    productDetailsRequested: selected.length,
    productsWithName: products.filter((product) => product.name).length,
    productsWithSourceCode: products.filter((product) => product.sourceCode).length,
    productsWithEan: products.filter((product) => product.ean).length,
    productsWithPriceCandidates: products.filter((product) => product.priceCandidates.length > 0).length,
    productsWithClassifiedPriceRoles: products.filter((product) => product.priceCandidates.length > 0 && product.priceCandidates.every((candidate) => candidate.role !== 'unclassified')).length,
    unclassifiedPriceCandidates: products.reduce((sum, product) => sum + product.priceCandidates.filter((candidate) => candidate.role === 'unclassified').length, 0),
    productsMissingEan: products.filter((product) => product.missingFields.includes('ean')).length,
    extractionWarnings: warningCount,
  }, null, 2))
}

main().catch((error: unknown) => {
  console.error('[Teta] collector failed:', error)
  process.exitCode = 1
})
