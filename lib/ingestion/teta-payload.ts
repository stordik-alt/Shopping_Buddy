// Decodes the Nuxt SSR payload that Teta's public catalog pages embed in
// `<script id="__NUXT_DATA__">`. The payload is a devalue `stringify` result: a flat array of
// "slots" where every value lives in its own slot and every *container* position holds the index
// of the slot that holds the value.
//
// The rule that matters: a slot holds the value itself, a container holds an index. So the price
// slot holds the number 1790 (haléře) and the product object holds 8296 — the index of that
// slot. Reading the number in the slot as another index (the obvious mistake) resolves the price
// to an unrelated object. This module is therefore the single place where that rule is encoded.
//
// Nothing here does I/O: the collector fetches HTML, this module turns it into typed records, and
// the tests feed it a captured payload.

/** Reducer tags Nuxt puts in front of a value it encoded itself (devalue custom reducers). */
const REDUCER_TAGS = new Set([
  'ShallowReactive',
  'ShallowRef',
  'Reactive',
  'Ref',
  'EmptyShallowRef',
  'EmptyRef',
  'EmptyShallowReactive',
  'EmptyReactive',
  'NuxtError',
  'Set',
  'Map',
  'Date',
  'BigInt',
  'RegExp',
])

/** Reducer tags whose value is `undefined` — there is no slot behind them. */
const EMPTY_REDUCER_TAGS = new Set(['EmptyShallowRef', 'EmptyRef', 'EmptyShallowReactive', 'EmptyReactive'])

// devalue encodes the values it cannot represent in JSON as negative numbers inside a container.
const SPECIAL_VALUES: Record<number, unknown> = {
  [-1]: undefined,
  [-2]: undefined, // a hole in an array
  [-3]: Number.NaN,
  [-4]: Number.POSITIVE_INFINITY,
  [-5]: Number.NEGATIVE_INFINITY,
  [-6]: -0,
}

/** Guards against a payload that nests deeper than any real one. */
const MAX_DEPTH = 200

export type NuxtPayload = {
  /** The raw slot array (`__NUXT_DATA__`). */
  values: unknown[]
  /** Resolves the value stored in a slot. */
  resolve(index: number): unknown
  /** The payload root: `{ data, state, once, _errors, serverRendered, path, pinia }`. */
  root(): Record<string, unknown>
  /** The `data` node — the per-request API results the page was rendered from. */
  data(): Record<string, unknown>
}

function createResolver(values: unknown[]) {
  const memo = new Map<number, unknown>()
  const inProgress = new Set<number>()
  // A value that was cut short by a cycle must not be memoized: the placeholder would then be
  // baked into every later read of the same slot.
  let sawCycle = false

  function resolveSlotEntry(entry: unknown, depth: number): unknown {
    // Only a non-negative integer inside a container is an index. A string, a boolean or null
    // inside a container is the value itself (devalue stores those in slots, but a hand-written
    // fixture may inline them).
    if (typeof entry === 'number' && Number.isInteger(entry)) {
      if (entry < 0) return SPECIAL_VALUES[entry]
      return resolveIndex(entry, depth)
    }
    return entry
  }

  function resolveSlot(value: unknown, depth: number): unknown {
    if (Array.isArray(value)) {
      const tag = typeof value[0] === 'string' ? value[0] : null
      if (tag && REDUCER_TAGS.has(tag)) {
        if (EMPTY_REDUCER_TAGS.has(tag)) return undefined
        if (tag === 'Set') {
          const entries = Array.isArray(value[1]) ? value[1] : []
          return new Set(entries.map((entry) => resolveSlotEntry(entry, depth + 1)))
        }
        if (tag === 'Map') {
          const entries = Array.isArray(value[1]) ? value[1] : []
          return new Map(
            entries.map((entry) =>
              Array.isArray(entry)
                ? [resolveSlotEntry(entry[0], depth + 1), resolveSlotEntry(entry[1], depth + 1)]
                : [entry, entry],
            ),
          )
        }
        // ShallowReactive | Reactive | Ref | ShallowRef | NuxtError | Date | BigInt | RegExp
        return resolveSlotEntry(value[1], depth + 1)
      }
      return value.map((entry) => resolveSlotEntry(entry, depth + 1))
    }
    if (value && typeof value === 'object') {
      const resolved: Record<string, unknown> = {}
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        resolved[key] = resolveSlotEntry(entry, depth + 1)
      }
      return resolved
    }
    // A number, a string, a boolean or null: the value itself.
    return value
  }

  function resolveIndex(index: number, depth = 0): unknown {
    if (!Number.isInteger(index) || index < 0 || index >= values.length) return undefined
    if (memo.has(index)) return memo.get(index)
    if (inProgress.has(index)) {
      sawCycle = true
      return '[cycle]'
    }
    if (depth > MAX_DEPTH) {
      sawCycle = true
      return '[max-depth]'
    }
    inProgress.add(index)
    sawCycle = false
    try {
      const resolved = resolveSlot(values[index], depth + 1)
      if (!sawCycle) memo.set(index, resolved)
      return resolved
    } finally {
      inProgress.delete(index)
    }
  }

  return { resolveIndex }
}

/** Extracts the `__NUXT_DATA__` JSON array from a page. */
export function extractNuxtPayloadValues(html: string): unknown[] {
  const match = /<script\b[^>]*id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)
  if (!match) throw new Error('Teta page has no __NUXT_DATA__ payload')
  const parsed: unknown = JSON.parse(match[1].trim())
  if (!Array.isArray(parsed)) throw new Error('Teta __NUXT_DATA__ payload is not an array')
  return parsed
}

export function decodeNuxtPayload(html: string): NuxtPayload {
  const values = extractNuxtPayloadValues(html)
  const { resolveIndex } = createResolver(values)
  let rootCache: Record<string, unknown> | null = null
  let dataCache: Record<string, unknown> | null = null

  const root = (): Record<string, unknown> => {
    if (rootCache) return rootCache
    const resolved = resolveIndex(0)
    rootCache = resolved && typeof resolved === 'object' && !Array.isArray(resolved)
      ? (resolved as Record<string, unknown>)
      : {}
    return rootCache
  }
  const data = (): Record<string, unknown> => {
    if (dataCache) return dataCache
    const resolved = root().data
    dataCache = resolved && typeof resolved === 'object' && !Array.isArray(resolved)
      ? (resolved as Record<string, unknown>)
      : {}
    return dataCache
  }
  return { values, resolve: (index) => resolveIndex(index), root, data }
}

// --- Listing -------------------------------------------------------------------------------------

export type TetaListingPrice = {
  /** The price the shopper pays now, in CZK. */
  amount: number
  /** The everyday price in CZK, when the product is discounted (the retailer's base price). */
  regularAmount?: number
  /** The unit price in CZK, when the product states one. */
  unitAmount?: number
  /** The unit the unit price refers to (KS, M, KG, LIT, PD). */
  unit?: string
  /** The discount in percent, when the product is on sale. */
  discountPercent?: number
  /** Data problems found while reading the price block. */
  warnings: string[]
}

export type TetaListingTaxon = {
  name: string
  code: string
  level?: number
}

export type TetaListingItem = {
  /** Teta's own product code (15 digits). */
  code: string
  /** The short article number shown to shoppers ("Kód: 196442"). */
  articleNumber?: string
  name: string
  slug: string
  price: TetaListingPrice
  currency: string
  /** The category path, from the top-level category down to the product's own taxon. */
  categoryPath: string[]
  /** The taxon codes of the same path, top level first ("hygiena", "KAPESNICKY-A-UBROUSKY", …).
   *  The top-level code is the stable category key; the display name can be re-worded by the
   *  retailer, the code cannot. */
  categoryCodes: string[]
  /** The brand, when the product belongs to one. */
  brand?: string
  available: boolean
  image?: string
}

export type TetaListingPayload = {
  pagination: { currentPage: number; lastPage: number; itemsPerPage: number; totalItems: number }
  items: TetaListingItem[]
}

/** The payload key of the product list on a category page. */
const LISTING_KEY_PREFIX = 'categoryProductData/api/v2/shop/search/products-variants'

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** The payload stores money in haléře; the app stores CZK. */
export function tetaMoneyToCzk(halere: number | undefined): number | undefined {
  if (halere === undefined || !Number.isFinite(halere)) return undefined
  return Math.round(halere) / 100
}

/**
 * Reads the category path, the brand and the marketing labels out of a product's taxon list.
 *
 * Teta hands every product a flat list of taxons from three different trees at once: the
 * category tree, the brand tree and the marketing-label tree ("V akci", "Exkluzivně online").
 * The tree a taxon belongs to is named by its `parent.code`:
 *
 *   `menu_category`   — a real category (the root of the category tree)
 *   `article_brands`  — a brand
 *   `article_tags`    — a marketing label
 *
 * The category path is then walked up from the product's own category through the parents the
 * list names, so the path contains categories only — a brand never sneaks into it.
 */
function readTaxonomy(taxa: unknown): { path: string[]; codes: string[]; brand?: string; tags: string[] } {
  if (!Array.isArray(taxa)) return { path: [], codes: [], tags: [] }
  const entries = taxa
    .map((taxon) => {
      if (!taxon || typeof taxon !== 'object') return null
      const item = taxon as Record<string, unknown>
      const name = asString(item.name)
      const code = asString(item.code)
      if (!name || !code) return null
      const parent = item.parent && typeof item.parent === 'object' ? (item.parent as Record<string, unknown>) : {}
      return { name, code, parentCode: asString(parent.code) ?? '' }
    })
    .filter((entry): entry is { name: string; code: string; parentCode: string } => entry !== null)
  if (entries.length === 0) return { path: [], codes: [], tags: [] }

  const byCode = new Map(entries.map((entry) => [entry.code, entry]))
  const brand = entries.find((entry) => entry.parentCode === 'article_brands')?.name
  const tags = entries.filter((entry) => entry.parentCode === 'article_tags').map((entry) => entry.name)

  // A taxon belongs to the category tree when its parent is the tree root or another taxon of
  // the list. Brands and marketing labels hang under their own trees and are left out.
  const inCategoryTree = (entry: { code: string; parentCode: string }): boolean =>
    entry.parentCode === 'menu_category' || byCode.has(entry.parentCode)
  const hasChild = (entry: { code: string }): boolean => entries.some((other) => other.parentCode === entry.code)

  // The product's own category is the deepest taxon of the category tree — the one no other taxon
  // of the list hangs under.
  const leaf = entries.find((entry) => inCategoryTree(entry) && !hasChild(entry))
  const path: string[] = []
  const codes: string[] = []
  if (leaf) {
    const chain: { name: string; code: string }[] = []
    const seen = new Set<string>()
    let current: { name: string; code: string; parentCode: string } | undefined = leaf
    while (current && !seen.has(current.code)) {
      seen.add(current.code)
      chain.push({ name: current.name, code: current.code })
      current = current.parentCode ? byCode.get(current.parentCode) : undefined
    }
    const reversed = chain.reverse()
    path.push(...reversed.map((entry) => entry.name))
    codes.push(...reversed.map((entry) => entry.code))
  }
  return { path, codes, ...(brand ? { brand } : {}), tags }
}

/** Teta's own product code is 15 digits; the shopper sees a shorter article number ("Kód: 196442"). */
const TETA_PRODUCT_CODE = /^\d{15}$/

/** Reads the 15-digit product code out of a product variant's iri ("/api/v2/shop/product-variants/000…"). */
function readProductCode(iri: unknown): string | undefined {
  const value = asString(iri)
  if (!value) return undefined
  const match = /(\d{15})(?:\D|$)/.exec(value)
  return match ? match[1] : undefined
}

/**
 * Reads Teta's price block.
 *
 * The block holds up to three numbers. Verified against the rendered product page (2026-10-22):
 *
 *   `zcmd` — the everyday price. It is the price shown struck through next to a lower action
 *            price, and the price of the product when no action runs.
 *   `acmd` — the action price: the price the shopper pays while the action runs. Teta publishes
 *            no end date for it (the payload carries no validity window anywhere), so it cannot
 *            become a dated promotion.
 *   `unit_price` — the unit price of the *current* price, in haléře per one unit of `unit`
 *            ("KS" = piece, "LIT" = litre, "KG" = kilogram, "M" = metre, "PD" = dose).
 *
 * The listing's own `price` field is the same number as `acmd` while an action runs and the same
 * as `zcmd` otherwise; it is the fallback when the price block is missing one of the two.
 */
function readPriceBlock(source: Record<string, unknown>): TetaListingPrice | null {
  const bbyPrices = (source.bbyPrices ?? {}) as Record<string, unknown>
  const unitPrice = (bbyPrices.unit_price ?? {}) as Record<string, unknown>
  const sale = (bbyPrices.sale ?? {}) as Record<string, unknown>

  const everyday = tetaMoneyToCzk(asNumber(bbyPrices.zcmd))
  const action = tetaMoneyToCzk(asNumber(bbyPrices.acmd))
  const listed = tetaMoneyToCzk(asNumber(source.price))
  const warnings: string[] = []

  let amount = action ?? listed ?? everyday
  let regularAmount = everyday ?? amount
  if (amount === undefined || amount <= 0) return null

  if (regularAmount !== undefined && regularAmount < amount) {
    // An "action" price above the everyday price is not a promotion — the everyday price is the
    // price the shopper pays, and the disagreement is flagged rather than smoothed over.
    warnings.push('action-price-above-everyday-price')
    amount = regularAmount
  }

  // The discount the retailer states; when it states none, the discount is computed from the two
  // prices. Both describe the same relation, so the stated one only confirms it.
  let discountPercent: number | undefined
  if (sale.unit === '%') {
    const stated = asNumber(sale.amount)
    if (stated !== undefined && stated > 0) discountPercent = Math.round(stated)
  }
  if (discountPercent === undefined && regularAmount !== undefined && regularAmount > amount) {
    discountPercent = Math.round(((regularAmount - amount) / regularAmount) * 100)
  }

  // The unit price is not rounded: the app's per-piece prices are small (0,179 Kč/ks) and the
  // database rounds them when it writes them.
  const unitNumber = asNumber(unitPrice.number)
  const unitAmount = unitNumber !== undefined && unitNumber > 0 ? unitNumber / 100 : undefined

  return {
    amount,
    ...(regularAmount !== undefined && regularAmount > amount ? { regularAmount } : {}),
    ...(unitAmount !== undefined
      ? { unitAmount, ...(asString(unitPrice.unit) ? { unit: asString(unitPrice.unit) } : {}) }
      : {}),
    ...(discountPercent !== undefined ? { discountPercent } : {}),
    warnings,
  }
}

export function parseTetaListingPayload(html: string): TetaListingPayload {
  const payload = decodeNuxtPayload(html)
  const data = payload.data()
  const listingKey = Object.keys(data).find((key) => key.startsWith(LISTING_KEY_PREFIX))
  if (!listingKey) throw new Error('Teta listing page has no product list in its payload')
  const listing = data[listingKey] as Record<string, unknown>
  const pagination = (listing.pagination ?? {}) as Record<string, unknown>
  const rawItems = Array.isArray(listing.items) ? listing.items : []

  const items: TetaListingItem[] = []
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    // The listing carries the short article number; the 15-digit code is in the variant's iri.
    const code = readProductCode(item.iri)
    const name = asString(item.name)
    if (!code || !name) continue
    const articleNumber = asString(item.code)

    const price = readPriceBlock(item)
    if (!price) continue

    const { path, codes, brand } = readTaxonomy(item.taxa)
    items.push({
      code,
      ...(articleNumber ? { articleNumber } : {}),
      name,
      slug: asString(item.slug) ?? '',
      price,
      currency: asString(item.currency) ?? 'CZK',
      categoryPath: path,
      categoryCodes: codes,
      ...(brand ? { brand } : {}),
      available: item.isStockAvailable === true,
      ...(asString(item.image) ? { image: asString(item.image) } : {}),
    })
  }

  return {
    pagination: {
      currentPage: asNumber(pagination.currentPage) ?? 1,
      lastPage: asNumber(pagination.lastPage) ?? 1,
      itemsPerPage: asNumber(pagination.itemsPerPage) ?? items.length,
      totalItems: asNumber(pagination.totalItems) ?? items.length,
    },
    items,
  }
}

// --- Detail --------------------------------------------------------------------------------------

export type TetaDetailAttribute = {
  code: string
  name: string
  value: string
}

export type TetaDetailProduct = {
  code: string
  name: string
  slug: string
  description?: string
  currency: string
  price: TetaListingPrice
  categoryPath: string[]
  /** The taxon codes of the same path, top level first. */
  categoryCodes: string[]
  brand?: string
  images: string[]
  createdAt?: string
  updatedAt?: string
  available: boolean
}

export type TetaDetailPayload = {
  product: TetaDetailProduct
  attributes: TetaDetailAttribute[]
  /** The codes of the products Teta itself offers as similar ones. */
  similarCodes: string[]
}

const DETAIL_PRODUCT_KEY_PREFIX = '/api/v2/shop/products-by-slug/'
const DETAIL_ATTRIBUTES_KEY_PREFIX = '/api/v2/shop/products/'

function readAttributes(node: unknown): TetaDetailAttribute[] {
  if (!node || typeof node !== 'object') return []
  const result = (node as Record<string, unknown>).result
  if (!Array.isArray(result)) return []
  const attributes: TetaDetailAttribute[] = []
  for (const entry of result) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const code = asString(item.code)
    if (!code) continue
    const raw = item.value
    const value = Array.isArray(raw) ? raw.filter((part): part is string => typeof part === 'string').join(', ') : asString(raw)
    attributes.push({ code, name: asString(item.name) ?? code, value: value ?? '' })
  }
  return attributes
}

export function parseTetaDetailPayload(html: string): TetaDetailPayload {
  const payload = decodeNuxtPayload(html)
  const data = payload.data()
  const productKey = Object.keys(data).find((key) => key.startsWith(DETAIL_PRODUCT_KEY_PREFIX) && !key.includes('/associations/'))
  if (!productKey) throw new Error('Teta product page has no product in its payload')
  const raw = data[productKey] as Record<string, unknown>
  const variants = Array.isArray(raw.variants) ? raw.variants : []
  const variant = (variants[0] ?? {}) as Record<string, unknown>
  const price = readPriceBlock(variant)
  if (!price) throw new Error('Teta product page has no usable price')

  const { path, codes, brand: taxonBrand } = readTaxonomy(variant.taxa ?? raw.productTaxons)
  const images = Array.isArray(raw.images)
    ? raw.images
        .map((image) => (image && typeof image === 'object' ? asString((image as Record<string, unknown>).path) : undefined))
        .filter((image): image is string => Boolean(image))
    : []

  const attributesKey = Object.keys(data).find((key) => key.startsWith(DETAIL_ATTRIBUTES_KEY_PREFIX) && key.includes('/attributes'))
  const attributes = attributesKey ? readAttributes(data[attributesKey]) : []
  // The brand attribute is the retailer's own statement about the brand; the brand taxon is the
  // same brand as the shopper sees it in the navigation. The attribute wins.
  const brand = attributeValue(attributes, 'ZNACKA') ?? attributeValue(attributes, 'ZNACKA_STANDARDIZOVANA') ?? taxonBrand

  const similarKey = Object.keys(data).find((key) => key.includes('/associations/similar-products'))
  const similarCodes: string[] = []
  if (similarKey) {
    const similar = data[similarKey]
    const list = similar && typeof similar === 'object' ? (similar as Record<string, unknown>).items : null
    if (Array.isArray(list)) {
      for (const entry of list) {
        if (!entry || typeof entry !== 'object') continue
        const code = asString((entry as Record<string, unknown>).code)
        if (code) similarCodes.push(code)
      }
    }
  }

  const code = readProductCode(variant.iri) ?? readProductCode(raw['@id']) ?? asString(raw.code)
  const name = asString(raw.name)
  if (!code || !name || !TETA_PRODUCT_CODE.test(code)) {
    throw new Error('Teta product page has no product identity')
  }

  return {
    product: {
      code,
      name,
      slug: asString(raw.slug) ?? asString(variant.slug) ?? '',
      ...(asString(raw.description) ? { description: asString(raw.description) } : {}),
      currency: asString(variant.currency) ?? 'CZK',
      price,
      categoryPath: path,
      categoryCodes: codes,
      ...(brand ? { brand } : {}),
      images,
      ...(asString(raw.createdAt) ? { createdAt: asString(raw.createdAt) } : {}),
      ...(asString(raw.updatedAt) ? { updatedAt: asString(raw.updatedAt) } : {}),
      available: variant.isPublicated !== false && variant.enabled !== false,
    },
    attributes,
    similarCodes,
  }
}

/** Reads a single attribute value by its code. */
export function attributeValue(attributes: TetaDetailAttribute[], code: string): string | undefined {
  const found = attributes.find((attribute) => attribute.code === code)
  const value = found?.value?.trim()
  return value ? value : undefined
}
