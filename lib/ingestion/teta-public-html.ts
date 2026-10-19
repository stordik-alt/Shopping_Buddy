import { fetchWithTimeout } from '@/lib/ingestion/http'

export const TETA_PUBLIC_CATALOG_URL = 'https://www.tetadrogerie.cz/eshop/produkty/vse'
const PRODUCT_PATH = /href=["']([^"']*\/eshop\/katalog\/[^"'?#]+)(?:\?[^"']*)?["']/gi

export type TetaPublicCatalogLink = { url: string; slug: string }
export type TetaPriceCandidate = {
  amount: number
  role: 'displayed_price' | 'regular_price' | 'conditional_promotion' | 'loyalty_price' | 'unclassified'
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
        if (types.some((type) => typeof type === 'string' && type.split(/[\/#]/).pop() === 'Product')) jsonLdProducts.push(item)
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
  const normalizeEan = (value: unknown): string | undefined => {
    if (typeof value !== 'string' && typeof value !== 'number') return undefined
    const normalized = String(value).replace(/[\s-]/g, '')
    return /^(?:\d{8}|\d{12,14})$/.test(normalized) ? normalized : undefined
  }
  const jsonEan = jsonLdProducts
    .flatMap((product) => [
      product.gtin13, product.gtin14, product.gtin12, product.gtin8, product.gtin,
      ...(Array.isArray(product.additionalProperty)
        ? product.additionalProperty.flatMap((property) => {
            if (!property || typeof property !== 'object') return []
            const entry = property as Record<string, unknown>
            return /(?:ean|gtin)/i.test(String(entry.name ?? entry.propertyID ?? '')) ? [entry.value] : []
          })
        : []),
    ])
    .map(normalizeEan)
    .find((value): value is string => Boolean(value))
  const attributeEan = [...html.matchAll(/<[a-z][^>]*>/gi)]
    .map((tagMatch) => {
      const attributes = new Map<string, string>()
      for (const attribute of tagMatch[0].matchAll(/([\\w:-]+)\\s*=\\s*["']([^"']*)["']/g)) {
        attributes.set(attribute[1].toLowerCase(), decodeTetaHtml(attribute[2]).trim())
      }
      // Prefer explicit EAN/GTIN attributes, then schema.org-style property/name + content.
      for (const [key, value] of attributes) {
        if (/(?:^|[-_:])(?:ean|gtin)(?:\\d{1,2})?$/i.test(key) || /^(?:data-)?(?:ean|gtin)(?:\\d{1,2})?$/i.test(key)) {
          const normalized = normalizeEan(value)
          if (normalized) return normalized
        }
      }
      const identity = [attributes.get('itemprop'), attributes.get('property'), attributes.get('name'), attributes.get('data-field'), attributes.get('id')]
        .filter(Boolean).join(' ').toLowerCase()
      const value = attributes.get('content') ?? attributes.get('value') ?? attributes.get('data-value')
      return /(?:^|[\\s:_-])(?:ean|gtin(?:8|12|13|14)?)(?:$|[\\s:_-])/.test(identity)
        ? normalizeEan(value)
        : undefined
    })
    .find((value): value is string => Boolean(value))
  const eanMatch = /\\b(?:EAN|GTIN)\\s*:?\\s*(\\d{8}|\\d{12,14})\\b/i.exec(text)
  const sourceCode = codeMatch?.[1] ?? (typeof jsonProduct?.sku === 'string' ? jsonProduct.sku : undefined)
  const ean = eanMatch?.[1] ?? jsonEan ?? attributeEan
  const unitMatch = /([\d\s.,]+\s*Kč\s*\/\s*(?:KG|KGM|LIT|L|ML|G|KS|M))\b/i.exec(text)
  // Ignore unit-price values (for example, Kč/KS) and parse only package-price candidates.
  const priceMatches = [...text.matchAll(/(\d[\d\s]*[,.]\d{2})\s*Kč(?!\s*\/)/gi)]
  const rawPriceCandidates = priceMatches
    .map((match) => {
      const amount = Number(match[1].replace(/\s/g, '').replace(',', '.'))
      const start = match.index ?? 0
      const end = start + match[0].length
      const before = text.slice(Math.max(0, start - 150), start)
      const after = text.slice(end, Math.min(text.length, end + 180))
      const context = (before + ' ' + after).replace(/\s+/g, ' ').trim()
      const conditionAfter = /^\s*\*?\s*(?:za\s+1\s+ks\s+)?při\s+koupi\b[^.!?]{0,140}/i.exec(after)
      const conditionBefore = /(?:při\s+koupi\b[^.!?]{0,100})\s*$/i.exec(before)
      const conditionMatch = conditionAfter ?? conditionBefore
      const loyaltyBefore = /(?:s\s+(?:klubovou|věrnostní)\s+kartou|s\s+kartou|pro\s+členy|cena\s+pro\s+členy|s\s+aplikací)\s*[:\-]?\s*$/i.exec(before)
      const loyaltyAfter = /^\s*(?:s\s+(?:klubovou|věrnostní)\s+kartou|s\s+kartou|pro\s+členy|cena\s+pro\s+členy|s\s+aplikací)\b/i.exec(after)
      const loyaltyMatch = loyaltyBefore ?? loyaltyAfter
      const evidenceText = text.slice(Math.max(0, start - 55), Math.min(text.length, end + 100)).replace(/\s+/g, ' ').trim()
      return {
        amount,
        start,
        end,
        role: conditionMatch
          ? 'conditional_promotion' as const
          : loyaltyMatch
            ? 'loyalty_price' as const
            : 'unclassified' as const,
        ...(conditionMatch ? { conditionText: conditionMatch[0].replace(/\s+/g, ' ').trim().slice(0, 160) } : {}),
        evidenceText,
      }
    })
    .filter((candidate) => Number.isFinite(candidate.amount) && candidate.amount > 0)

  // A percentage marker can prove a regular/discount pair, but it does not make the
  // discounted price conditional. A conditional price requires an explicit purchase rule.
  const discountMarkers = [...text.matchAll(/(?:-\s*\d{1,3}\s*%|\b(?:sleva|zlevněno|ušetříte)\b)/gi)]
    .map((match) => match.index ?? 0)
  const normalizedPriceCandidates = rawPriceCandidates.map((candidate, index, all) => {
    if (candidate.role !== 'unclassified') return candidate
    const hasNearbyDiscountMarker = discountMarkers.some((position) =>
      position >= candidate.start - 100 && position <= candidate.end + 180)
    if (all.length === 2 && hasNearbyDiscountMarker) {
      const [first, second] = all
      if (first.amount !== second.amount) {
        const higher = first.amount > second.amount ? first : second
        const lower = first.amount < second.amount ? first : second
        if (candidate.amount === higher.amount) return { ...candidate, role: 'regular_price' as const }
        if (candidate.amount === lower.amount) return { ...candidate, role: 'displayed_price' as const }
      }
    }
    // An unconditional package price can be identified only when the other candidate
    // is explicitly conditional/loyalty-based and this candidate has no such marker.
    if (all.length === 2 && all.some((other) => other.role === 'conditional_promotion' || other.role === 'loyalty_price')) {
      return { ...candidate, role: 'displayed_price' as const }
    }
    // A lone package price is the displayed price unless evidence says otherwise.
    if (all.length === 1) return { ...candidate, role: 'displayed_price' as const }
    return candidate
  })
  const priceCandidates: TetaPriceCandidate[] = normalizedPriceCandidates.map(({ start: _start, end: _end, ...candidate }) => candidate)
  const uniquePriceCandidates = normalizedPriceCandidates.filter((candidate, index, all) =>
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
