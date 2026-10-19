import { fetchWithTimeout } from '@/lib/ingestion/http'

export const TETA_PUBLIC_CATALOG_URL = 'https://www.tetadrogerie.cz/eshop/produkty/vse'
const PRODUCT_PATH = /href=["']([^"']*\/eshop\/katalog\/[^"'?#]+)(?:\?[^"']*)?["']/gi

export type TetaPublicCatalogLink = { url: string; slug: string }
export type TetaPublicPageProduct = {
  url: string
  name?: string
  sourceCode?: string
  brand?: string
  ean?: string
  prices: number[]
  unitPriceText?: string
  onlineAvailability?: 'available' | 'unavailable' | 'unknown'
  categoryPath: string[]
  extractionWarnings: string[]
}

export function decodeTetaHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
}

export function htmlToTetaText(html: string): string {
  return decodeTetaHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/[\t\r\n ]+/g, ' ').trim()
}

/** Reads only public catalog/product HTML URLs. It intentionally never calls /api/, /price or /inventory. */
export function parseTetaCatalogLinks(html: string, baseUrl = 'https://www.tetadrogerie.cz'): TetaPublicCatalogLink[] {
  const links = new Map<string, TetaPublicCatalogLink>()
  for (const match of html.matchAll(PRODUCT_PATH)) {
    const raw = decodeTetaHtml(match[1]).replace(/&amp;/g, '&')
    const url = new URL(raw, baseUrl)
    if (url.origin !== 'https://www.tetadrogerie.cz' || !url.pathname.startsWith('/eshop/katalog/')) continue
    url.search = ''
    url.hash = ''
    const normalized = url.toString()
    links.set(normalized, { url: normalized, slug: url.pathname.split('/').pop() ?? '' })
  }
  return [...links.values()]
}

/** Parses public product detail HTML conservatively. Uncertain fields are left blank and warned about. */
export function parseTetaPublicProductPage(html: string, url: string): TetaPublicPageProduct {
  const text = htmlToTetaText(html)
  const warnings: string[] = []
  const titleMatch = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
  const jsonLdProducts: Record<string, unknown>[] = []
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed: unknown = JSON.parse(script[1].trim())
      const visit = (value: unknown): void => {
        if (Array.isArray(value)) return value.forEach(visit)
        if (!value || typeof value !== 'object') return
        const item = value as Record<string, unknown>
        const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']]
        if (types.includes('Product')) jsonLdProducts.push(item)
        if (Array.isArray(item['@graph'])) visit(item['@graph'])
      }
      visit(parsed)
    } catch {
      warnings.push('malformed JSON-LD block ignored')
    }
  }
  const jsonProduct = jsonLdProducts[0]
  const jsonBrand = jsonProduct?.brand
  const brand = typeof jsonBrand === 'string'
    ? jsonBrand
    : jsonBrand && typeof jsonBrand === 'object' && typeof (jsonBrand as Record<string, unknown>).name === 'string'
      ? (jsonBrand as Record<string, unknown>).name as string
      : undefined
  const name = titleMatch ? htmlToTetaText(titleMatch[1]) : typeof jsonProduct?.name === 'string' ? jsonProduct.name : undefined
  const codeMatch = /\bKód:\s*([\w-]+)/i.exec(text)
  const jsonEan = [jsonProduct?.gtin13, jsonProduct?.gtin14, jsonProduct?.gtin12, jsonProduct?.gtin8, jsonProduct?.gtin]
    .find((value) => typeof value === 'string' && /^(?:\d{8}|\d{12,14})$/.test(value))
  const eanMatch = /\b(?:EAN|GTIN)\s*:?\s*(\d{8}|\d{12,14})\b/i.exec(text)
  const sourceCode = codeMatch?.[1] ?? (typeof jsonProduct?.sku === 'string' ? jsonProduct.sku : undefined)
  const ean = eanMatch?.[1] ?? (typeof jsonEan === 'string' ? jsonEan : undefined)
  const unitMatch = /([\d\s.,]+\s*Kč\s*\/\s*(?:KG|KGM|LIT|L|ML|G|KS|M))\b/i.exec(text)
  const prices = [...text.matchAll(/(\d[\d\s]*[,.]\d{2})\s*Kč\b/gi)]
    .map((match) => Number(match[1].replace(/\s/g, '').replace(',', '.')))
    .filter((price) => Number.isFinite(price) && price > 0)
  const uniquePrices = [...new Set(prices)]
  const onlineAvailability = /Nedostupné online/i.test(text)
    ? 'unavailable'
    : /Dostupné online/i.test(text)
      ? 'available'
      : 'unknown'
  const breadcrumbRegion = /<nav\b[^>]*aria-label=["']breadcrumb["'][^>]*>([\s\S]*?)<\/nav>/i.exec(html)
  const categoryPath = breadcrumbRegion
    ? [...breadcrumbRegion[1].matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => htmlToTetaText(m[1])).filter(Boolean)
    : typeof jsonProduct?.category === 'string'
      ? jsonProduct.category.split(/[>/]/).map((part) => part.trim()).filter(Boolean)
      : []

  if (!name) warnings.push('product name not found in h1 or JSON-LD')
  if (!sourceCode) warnings.push('source product code not found')
  if (uniquePrices.length === 0) warnings.push('no displayed price found')
  if (uniquePrices.length > 1) warnings.push('multiple prices found; price roles need source-specific verification')
  if (!ean) warnings.push('EAN not exposed in visible text or JSON-LD')
  if (categoryPath.length === 0) warnings.push('breadcrumb category path not found')

  return {
    url,
    name,
    sourceCode,
    brand,
    ean,
    prices: uniquePrices,
    unitPriceText: unitMatch?.[1]?.replace(/\s+/g, ' ').trim(),
    onlineAvailability,
    categoryPath,
    extractionWarnings: warnings,
  }
}

export async function fetchTetaPublicHtml(url: string): Promise<string> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.tetadrogerie.cz') {
    throw new Error('Teta collector only permits HTTPS pages on www.tetadrogerie.cz')
  }
  if (/^\/(?:api|inventory|price)(?:\/|$)/i.test(parsed.pathname)) {
    throw new Error('Blocked by collector policy: Teta robots.txt disallows this path')
  }
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'ANITKA-public-catalog-research/1.0 (+https://mojeanitka.cz)',
    },
  })
  if (!response.ok) throw new Error(`Teta public HTML request failed: HTTP ${response.status} (${url})`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) {
    throw new Error(`Expected public HTML, got ${type || 'unknown content type'} (${url})`)
  }
  return response.text()
}
