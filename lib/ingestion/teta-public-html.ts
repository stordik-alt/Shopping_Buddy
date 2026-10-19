import { fetchWithTimeout } from '@/lib/ingestion/http'

export const TETA_PUBLIC_CATALOG_URL = 'https://www.tetadrogerie.cz/eshop/produkty/vse'
const PRODUCT_PATH = /href=["']([^"']*\/eshop\/katalog\/[^"'?#]+)(?:\?[^"']*)?["']/gi

export type TetaPublicCatalogLink = { url: string; slug: string }
export type TetaPriceCandidate = {
  amount: number
  role: 'displayed_price' | 'conditional_promotion' | 'unclassified'
  conditionText?: string
  evidenceText: string
}

export type TetaPublicPageProduct = {
  url: string
  name?: string
  sourceCode?: string
  brand?: string
  ean?: string
  prices: number[]
  priceCandidates: TetaPriceCandidate[]
  unitPriceText?: string
  onlineAvailability?: 'available' | 'unavailable' | 'unknown'
  categoryPath: string[]
  missingFields: string[]
  extractionWarnings: string[]
}

export function decodeTetaHtml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|nbsp|amp|quot|apos|lt|gt);/gi, (entity, code: string) => {
    switch (code.toLowerCase()) {
      case 'nbsp':
      case '#160':
      case '#xa0':
        return ' '
      case 'amp':
        return '&'
      case 'quot':
        return '"'
      case '#39':
      case 'apos':
        return "'"
      case 'lt':
        return '<'
      case 'gt':
        return '>'
      default: {
        const codePoint = code.toLowerCase().startsWith('#x')
          ? parseInt(code.slice(2), 16)
          : code.startsWith('#')
            ? Number(code.slice(1))
            : NaN
        if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity
        return String.fromCodePoint(codePoint)
      }
    }
  })
}

export function htmlToTetaText(html: string): string {
  // Allow whitespace before the closing angle bracket in end tags (for example, </script >).
  // This remains a conservative text extractor, not a general-purpose HTML parser.
  return decodeTetaHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/[\t\r\n ]+/g, ' ').trim()
}

/** Matches robots.txt Disallow path prefixes. */
export function isTetaPathDisallowed(pathname: string, disallowRules: string[]): boolean {
  return disallowRules.some((rule) => rule !== '' && pathname.startsWith(rule))
}

let tetaRobotsRulesPromise: Promise<string[]> | undefined

async function getTetaRobotsDisallowRules(): Promise<string[]> {
  const response = await fetchWithTimeout('https://www.tetadrogerie.cz/robots.txt', {
    headers: { Accept: 'text/plain', 'User-Agent': 'ANITKA-public-catalog-research/1.0 (+https://mojeanitka.cz)' },
  })
  if (!response.ok) throw new Error('Cannot verify Teta robots.txt; collector stops')
  const text = await response.text()
  const rules: string[] = []
  for (const group of text.split(/\n\s*\n/)) {
    const lines = group.split(/\r?\n/).map((line) => line.trim())
    const agents = lines
      .filter((line) => /^User-agent:/i.test(line))
      .map((line) => line.split(':').slice(1).join(':').trim())
    if (!agents.includes('*')) continue
    for (const line of lines) {
      if (!/^Disallow:/i.test(line)) continue
      const rule = line.split(':').slice(1).join(':').trim()
      if (rule) rules.push(rule)
    }
  }
  return [...new Set(rules)]
}

async function assertTetaPathAllowed(pathname: string): Promise<void> {
  tetaRobotsRulesPromise ??= getTetaRobotsDisallowRules()
  const rules = await tetaRobotsRulesPromise
  if (isTetaPathDisallowed(pathname, rules)) {
    throw new Error('Teta robots.txt disallows this path; collector stopped')
  }
}

/** Reads only public catalog/product HTML URLs. It intentionally never calls /api/, /price or /inventory. */
export function parseTetaCatalogLinks(html: string, baseUrl = 'https://www.tetadrogerie.cz'): TetaPublicCatalogLink[] {
  const links = new Map<string, TetaPublicCatalogLink>()
  for (const match of html.matchAll(PRODUCT_PATH)) {
    const raw = decodeTetaHtml(match[1])
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
  const attributeEan = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => {
      const attributes = new Map<string, string>()
      for (const attribute of match[0].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) {
        attributes.set(attribute[1].toLowerCase(), decodeTetaHtml(attribute[2]).trim())
      }
      const identity = [attributes.get('itemprop'), attributes.get('property'), attributes.get('name'), attributes.get('data-field')]
        .filter(Boolean).join(' ').toLowerCase()
      const value = attributes.get('content') ?? attributes.get('value')
      return /(?:^|[\s:_-])(?:ean|gtin(?:8|12|13|14)?)(?:$|[\s:_-])/.test(identity)
        && value && /^(?:\d{8}|\d{12,14})$/.test(value) ? value : undefined
    })
    .find((value): value is string => Boolean(value))
  const eanMatch = /\b(?:EAN|GTIN)\s*:?\s*(\d{8}|\d{12,14})\b/i.exec(text)
  const sourceCode = codeMatch?.[1] ?? (typeof jsonProduct?.sku === 'string' ? jsonProduct.sku : undefined)
  const ean = eanMatch?.[1] ?? (typeof jsonEan === 'string' ? jsonEan : attributeEan)
  const unitMatch = /([\d\s.,]+\s*Kč\s*\/\s*(?:KG|KGM|LIT|L|ML|G|KS|M))\b/i.exec(text)
  const priceMatches = [...text.matchAll(/(\d[\d\s]*[,.]\d{2})\s*Kč(?!\s*\/)/gi)]
  const priceCandidates: TetaPriceCandidate[] = priceMatches
    .map((match, index) => {
      const amount = Number(match[1].replace(/\s/g, '').replace(',', '.'))
      const start = match.index ?? 0
      const after = text.slice(start + match[0].length, start + match[0].length + 180)
      const before = text.slice(Math.max(0, start - 50), start)
      const conditionMatch = /^\s*\*?\s*(?:za\s+[^*]{0,120}?při koupi[^*]{0,80}|(?:při koupi|s klubovou kartou|s kartou|v akci|po slevě)[^*]{0,100})/i.exec(after)
      const isConditional = Boolean(conditionMatch)
      const conditionText = conditionMatch?.[0].replace(/\s+/g, ' ').trim()
        .replace(/\s+(?:-?\d{1,3}%|Do košíku|\d+[,.]\d{2}\s*Kč).*/i, '')
        .slice(0, 160)
      const evidenceText = text.slice(Math.max(0, start - 30), Math.min(text.length, start + match[0].length + 90)).replace(/\s+/g, ' ').trim()
      return {
        amount,
        role: isConditional ? 'conditional_promotion' as const : index === 0 && priceMatches.length === 1 ? 'displayed_price' as const : 'unclassified' as const,
        ...(conditionText ? { conditionText } : {}),
        evidenceText,
        before,
      }
    })
    .filter((candidate) => Number.isFinite(candidate.amount) && candidate.amount > 0)
    .map(({ before: _before, ...candidate }) => candidate)
  const uniquePriceCandidates = priceCandidates.filter((candidate, index, all) =>
    all.findIndex((other) => other.amount === candidate.amount && other.role === candidate.role && other.conditionText === candidate.conditionText) === index)
  const uniquePrices = [...new Set(uniquePriceCandidates.map((candidate) => candidate.amount))]
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

  const missingFields: string[] = []
  if (!name) warnings.push('product name not found in h1 or JSON-LD')
  if (!sourceCode) warnings.push('source product code not found')
  if (uniquePrices.length === 0) warnings.push('no displayed price found')
  if (uniquePriceCandidates.some((candidate) => candidate.role === 'unclassified')) {
    warnings.push('one or more price candidates need role verification')
  }
  if (!ean) missingFields.push('ean')
  if (!brand) missingFields.push('brand')
  if (categoryPath.length === 0) missingFields.push('categoryPath')

  return {
    url,
    name,
    sourceCode,
    brand,
    ean,
    prices: uniquePrices,
    priceCandidates: uniquePriceCandidates,
    unitPriceText: unitMatch?.[1]?.replace(/\s+/g, ' ').trim(),
    onlineAvailability,
    categoryPath,
    missingFields,
    extractionWarnings: warnings,
  }
}

export async function fetchTetaPublicHtml(url: string): Promise<string> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.tetadrogerie.cz') {
    throw new Error('Teta collector only permits HTTPS pages on www.tetadrogerie.cz')
  }
  await assertTetaPathAllowed(parsed.pathname)
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
