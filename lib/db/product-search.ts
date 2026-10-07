import { eq, inArray, sql, type SQL } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { todayInPrague } from '@/lib/today'
import { getDb } from '@/lib/db/client'
import { isDirectMatch, likePattern, normalizeSearchText, scoreMatch, searchStem, searchStems, splitTokens, toComparableUnit, type ProductSearchHit } from '@/lib/product-search'
import { inferPackageSize, resolveCatalogPackageSize, resolveNamedPackageSize, type CatalogPackage } from '@/lib/recipes/packaging'
import type { ItemCategory, ItemUnit } from '@/lib/types'

// Text search over the products the chains sell — the ones they have prices for, and the ones the app
// knows only from a running offer (lib/product-search.ts has the rules; `currentPriceRows()` explains
// the difference). Data is global — catalog, prices and offers are not household-scoped — so nothing
// here needs a household; who may search is decided by the caller (`app/actions/product-search.ts`).

/** Upper bound on the rows one search reads. A query matching more than this is too vague to be
 *  useful; the best-ranked of these are still shown. */
const MAX_ROWS = 400

type PriceRow = {
  product_id: string
  name: string
  search_name: string
  category: ItemCategory
  store_id: string
  chain: string
  /** The regular price, or `null` for a (product, chain) pair the app knows only from a running offer. */
  regular_price: string | null
  /** The unit price of the price this row states: the regular one, or the offer's own. */
  unit: ItemUnit | null
  unit_price: string | null
  /** When the price was observed; `null` on an offer row, which is no price observation. */
  observed_at: string | null
}

type DealRow = {
  product_id: string
  store_id: string
  deal_price: string
  valid_until: string
  unit: ItemUnit | null
  unit_price: string | null
}

/**
 * The current price row of every (product, chain) pair the `filter` selects: its latest recorded
 * price, or — for a pair the chain has a running offer for and no price at all (an offers-only source
 * such as Penny) — that offer.
 *
 * Without the second part such a product cannot be found, put on a shopping list or planned at all,
 * even though the chain does sell it today. Its regular price is unknown and none is invented
 * (CLAUDE.md sections 15 and 18): `regular_price` and `observed_at` stay null, and the promotion's own
 * price and unit price stand in the `unit`/`unit_price` columns, so a package size derived from them
 * is the package that price belongs to. `loadActiveDeals()` supplies the promotion's price for the
 * row's (product, chain) pair.
 *
 * `filter` may only refer to the aliases `p` (products), `c` (product_categories) and `s` (stores):
 * the two arms read the chain from different tables, so the store restriction is applied here.
 */
function currentPriceRows(filter: SQL, storeIds?: string[]): SQL {
  const today = todayInPrague()
  const uuidList = (ids: string[]) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)
  const priceStores = storeIds ? sql` AND pr.store_id IN (${uuidList(storeIds)})` : sql``
  const dealStores = storeIds ? sql` AND d.store_id IN (${uuidList(storeIds)})` : sql``
  // Same "latest wins" rule as before: the most recently observed or confirmed price, the retailer's
  // own (OFFICIAL) figure first on a tie. The offer arm takes the cheapest offer per pair, matching
  // getStandaloneOffers() and loadActiveDeals().
  // The filter is parenthesized: the planner's batch query OR-s several items' word filters, and
  // `a OR b AND valid` would let the first item's rows past the promotion validity and the
  // "no price recorded" test as well as past the store restriction.
  return sql`
    (
      SELECT DISTINCT ON (pr.product_id, pr.store_id)
        pr.product_id, p.name, p.search_name, c.name AS category, pr.store_id, s.chain,
        pr.regular_price, pr.unit, pr.unit_price, coalesce(pr.last_confirmed_at, pr.observed_at) AS observed_at
      FROM prices pr
      JOIN products p ON p.id = pr.product_id
      JOIN product_categories c ON c.id = p.category_id
      JOIN stores s ON s.id = pr.store_id
      WHERE (${filter})${priceStores}
      ORDER BY pr.product_id, pr.store_id, coalesce(pr.last_confirmed_at, pr.observed_at) DESC, (pr.source_type = 'OFFICIAL') DESC
    )
    UNION ALL
    (
      SELECT DISTINCT ON (d.product_id, d.store_id)
        d.product_id, p.name, p.search_name, c.name AS category, d.store_id, s.chain,
        NULL::numeric AS regular_price, d.unit, d.unit_price, NULL::date AS observed_at
      FROM deals d
      JOIN products p ON p.id = d.product_id
      JOIN product_categories c ON c.id = p.category_id
      JOIN stores s ON s.id = d.store_id
      WHERE (${filter})
        AND d.valid_from <= ${today}::date AND d.valid_until >= ${today}::date
        AND NOT EXISTS (SELECT 1 FROM prices pr WHERE pr.product_id = d.product_id AND pr.store_id = d.store_id)${dealStores}
      ORDER BY d.product_id, d.store_id, d.deal_price ASC, d.valid_until DESC
    )
  `
}

/** One product-search request used by the shopping planner batch query. */
export type ProductSearchRequest = {
  tokens: string[]
  storeIds?: string[]
  category?: ItemCategory
}

/**
 * Runs multiple independent product searches through one SQL statement.
 *
 * The database first finds the union of rows matching any request, keeps the latest price once per
 * product/store — or the chain's running offer when it has no price for the product at all
 * (`currentPriceRows()`) — and the application then splits and scores the rows for each request. This
 * preserves the existing per-request semantics while avoiding one catalog/prices query per shopping
 * item.
 */
export async function searchProductHitsBatch(requests: ProductSearchRequest[]): Promise<ProductSearchHit[][]> {
  if (requests.length === 0) return []

  const results = Array.from({ length: requests.length }, () => [] as ProductSearchHit[])
  const active = requests
    .map((request, index) => {
      if (request.tokens.length === 0 || request.storeIds?.length === 0) return null
      const { required, optional } = splitTokens(request.tokens)
      if (required.length === 0) return null

      const wordFilters = sql.join(
        required.map((token) => sql`(p.search_name LIKE ANY (ARRAY[${sql.join(searchStems(token).map((stem) => sql`${likePattern(stem)}`), sql`, `)}]::text[]))`),
        sql` AND `,
      )
      return { index, tokens: request.tokens, required, optional, firstStem: searchStem(required[0]), storeIds: request.storeIds ? new Set(request.storeIds) : null, category: request.category, wordFilters }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  if (active.length === 0) return results

  // One query for every request: the words are OR-ed, the chains are the union of the requests'. Each
  // request is then scored and filtered below, exactly as before — the SQL only narrows the rows.
  const unionFilter = sql.join(active.map((entry) => sql`(${entry.wordFilters})`), sql` OR `)
  const stores = [...new Set(active.flatMap((entry) => (entry.storeIds ? [...entry.storeIds] : [])))]
  const storeRestriction = active.some((entry) => entry.storeIds === null) || stores.length === 0 ? undefined : stores
  const db = getDb()
  const priceRows = await db.execute<PriceRow>(sql`SELECT * FROM (${currentPriceRows(unionFilter, storeRestriction)}) current`)
  if (priceRows.rows.length === 0) return results

  const productIds = [...new Set(priceRows.rows.map((row) => row.product_id))]
  const [deals, packagesByProduct] = await Promise.all([
    loadActiveDeals(productIds),
    loadProductPackages(productIds),
  ])
  for (const entry of active) {
    results[entry.index] = priceRows.rows
      .map((row) => {
        if (entry.storeIds && !entry.storeIds.has(row.store_id)) return null
        if (entry.category && row.category !== entry.category) return null
        const score = scoreMatch(row.search_name, entry.required, entry.optional)
        if (score <= 0) return null
        return rowToHit(row, deals, score, isDirectMatch(row.search_name, entry.required), packagesByProduct)
      })
      .filter((hit): hit is ProductSearchHit => hit !== null)
      .sort((a, b) => {
        const positionA = normalizeSearchText(a.name).indexOf(entry.firstStem)
        const positionB = normalizeSearchText(b.name).indexOf(entry.firstStem)
        return positionA - positionB || a.name.length - b.name.length || a.productId.localeCompare(b.productId) || a.storeId.localeCompare(b.storeId)
      })
      .slice(0, MAX_ROWS)
  }
  return results
}
/** Products whose name contains every token, each with its latest recorded price at each chain that
 *  has one, and the chain's active promotion when there is one. `storeIds`, when given, restricts the
 *  chains. Scored, unsorted — group and order with `groupHitsByChain()`. Tokens are matched as
 *  parameterized LIKE patterns with wildcards escaped, never spliced into SQL. */
export async function searchProductHits(tokens: string[], options: { storeIds?: string[]; category?: ItemCategory } = {}): Promise<ProductSearchHit[]> {
  if (tokens.length === 0) return []
  const db = getDb()
  // Words must match; sizes/strengths ("1l") only rank higher — names often omit them.
  const { required, optional } = splitTokens(tokens)
  // Words are looked up by their stem, so every inflected form is found ("rohliky" finds "Rohlík");
  // the scoring then tells the same word from a derived one (lib/product-search.ts, word forms).
  const stems = required.map(searchStem)
  // Every word must match, by its own stem or a synonym's ("vajíčka" also finds "Vejce",
  // lib/synonyms.ts): an AND over the words of an OR over each word's stems.
  const wordFilters = sql.join(
    required.map((token) => sql`(p.search_name LIKE ANY (ARRAY[${sql.join(searchStems(token).map((stem) => sql`${likePattern(stem)}`), sql`, `)}]::text[]))`),
    sql` AND `,
  )
  const chains = options.storeIds
  if (chains && chains.length === 0) return []
  const categoryFilter = options.category ? sql` AND c.name = ${options.category}` : sql``

  // Which rows survive the MAX_ROWS cut must not be arbitrary: for a common word ("mléko") the
  // product itself would otherwise be dropped as often as a soup or a sauce that mentions it. So the
  // latest prices are ranked first — names where the first word appears earliest, then shorter names
  // ("Vejce M 10 ks" before "Polévka hovězí s vejcem") — and only then cut; the final order is the
  // pure scoring below.
  // The latest observation per product and chain is its current price (docs/03_DATABASE.md rule 14);
  // on the same day the retailer's own (OFFICIAL) price wins over a receipt-derived one. "Latest"
  // counts the date an unchanged official price was last confirmed (`last_confirmed_at`), not only
  // when it was first seen, so a confirmed price is neither shown as old nor beaten by an older
  // receipt; `observed_at` in the result is that date ("cena z …"). A chain's running offer stands in
  // for a price the app has none for, so an offers-only product is found too (currentPriceRows()).
  const priceRows = await db.execute<PriceRow>(sql`
    SELECT * FROM (${currentPriceRows(sql`${wordFilters}${categoryFilter}`, chains)}) current
    ORDER BY strpos(current.search_name, ${stems[0]}), length(current.search_name), current.product_id, current.store_id
    LIMIT ${MAX_ROWS}
  `)
  if (priceRows.rows.length === 0) return []

  const productIds = [...new Set(priceRows.rows.map((row) => row.product_id))]
  const [deals, packagesByProduct] = await Promise.all([
    loadActiveDeals(productIds),
    loadProductPackages(productIds),
  ])

  return priceRows.rows
    .map((row) => rowToHit(row, deals, scoreMatch(row.search_name, required, optional), isDirectMatch(row.search_name, required), packagesByProduct))
    .filter((hit) => hit.score > 0)
}

/** Promotions running today (started, not yet ended — the rule the rest of the app uses) of a chain, at any branch or
 *  chain-wide (an online-only chain's deals have no branch), keyed by `productId|storeId`. The
 *  cheapest of them per pair, with its own unit price — the same row `currentPriceRows()` picks. */
async function loadActiveDeals(productIds: string[]): Promise<Map<string, DealRow>> {
  if (productIds.length === 0) return new Map()
  const db = getDb()
  const today = todayInPrague()
  const dealRows = await db.execute<DealRow>(sql`
    SELECT DISTINCT ON (d.product_id, d.store_id)
      d.product_id, d.store_id, d.deal_price, d.valid_until, d.unit, d.unit_price
    FROM deals d
    WHERE d.valid_from <= ${today}::date AND d.valid_until >= ${today}::date AND d.product_id IN (${sql.join(productIds.map((id) => sql`${id}::uuid`), sql`, `)})
    ORDER BY d.product_id, d.store_id, d.deal_price ASC, d.valid_until DESC
  `)
  return new Map(dealRows.rows.map((row) => [`${row.product_id}|${row.store_id}`, row]))
}


async function loadProductPackages(productIds: string[]): Promise<Map<string, CatalogPackage[]>> {
  if (productIds.length === 0) return new Map()
  const db = getDb()
  const rows = await db.execute<{ product_id: string; quantity: string; unit: ItemUnit }>(sql`
    SELECT product_id, quantity, unit
    FROM product_packages
    WHERE product_id IN (${sql.join(productIds.map((id) => sql`${id}::uuid`), sql`, `)})
  `)
  const packages = new Map<string, CatalogPackage[]>()
  for (const row of rows.rows) {
    if (row.unit !== 'ks' && row.unit !== 'kg' && row.unit !== 'l') continue
    packages.set(row.product_id, [...(packages.get(row.product_id) ?? []), {
      quantity: Number(row.quantity),
      unit: row.unit,
    }])
  }
  return packages
}

function rowToHit(row: PriceRow, deals: Map<string, DealRow>, score: number, direct: boolean, packagesByProduct: Map<string, CatalogPackage[]>): ProductSearchHit {
  const deal = deals.get(`${row.product_id}|${row.store_id}`)
  const regularPrice = row.regular_price == null ? null : Number(row.regular_price)
  const dealPrice = deal ? Number(deal.deal_price) : null
  // The unit price of the price this row states: the regular one for a priced product, the offer's own
  // for a pair known only from an offer.
  const unitPrice = row.unit_price == null ? null : Number(row.unit_price)
  const comparable = row.unit != null && unitPrice != null ? toComparableUnit(row.unit, unitPrice) : null
  // A promotion that prints its own unit price is taken as it is (deals.unit_price); one that does not
  // is scaled by the regular price in hitUnitPrice(). Only the two values of one price pair are ever
  // combined here, so the package size they imply is the package that price belongs to.
  const dealComparable = deal != null && deal.unit != null && deal.unit_price != null && deal.unit === row.unit
    ? toComparableUnit(deal.unit, Number(deal.unit_price))
    : null
  const basis = row.unit != null && unitPrice != null
    ? { regularPrice: regularPrice ?? dealPrice ?? 0, unit: row.unit, unitPrice }
    : null
  const packageSize = basis == null
    ? null
    : resolveCatalogPackageSize(packagesByProduct.get(row.product_id) ?? [], basis, row.name)
      ?? resolveNamedPackageSize(row.name, basis)
      ?? inferPackageSize(basis)
  return {
    productId: row.product_id,
    name: row.name,
    category: row.category,
    storeId: row.store_id,
    chain: row.chain,
    regularPrice,
    dealPrice,
    dealValidUntil: deal?.valid_until ?? null,
    dealUnitPrice: dealComparable?.unitPrice ?? null,
    unit: comparable?.unit ?? null,
    unitPrice: comparable?.unitPrice ?? null,
    packageSize,
    observedAt: row.observed_at,
    score,
    direct,
  }
}

/** The latest price (and active promotion) of specific products at the given chains — how a pinned
 *  product is priced. Unscored (score 0) and direct: the user chose it. A product with no price at a
 *  chain is simply absent, unless the chain has a running offer for it — that is how a product the app
 *  knows only from an offer (Penny's) can be chosen and planned (currentPriceRows()). */
export async function getHitsForProducts(productIds: string[], storeIds: string[]): Promise<ProductSearchHit[]> {
  if (productIds.length === 0 || storeIds.length === 0) return []
  const db = getDb()
  const productFilter = sql`p.id IN (${sql.join(productIds.map((id) => sql`${id}::uuid`), sql`, `)})`
  const rows = await db.execute<PriceRow>(sql`SELECT * FROM (${currentPriceRows(productFilter, storeIds)}) current`)
  const resultProductIds = [...new Set(rows.rows.map((row) => row.product_id))]
  const [deals, packagesByProduct] = await Promise.all([
    loadActiveDeals(resultProductIds),
    loadProductPackages(resultProductIds),
  ])
  return rows.rows.map((row) => rowToHit(row, deals, 0, true, packagesByProduct))
}

/** The latest price at each of `storeIds` of every product of the given types (lib/product-types.ts),
 *  with the type key of each product — the candidates of shopping-list items that name a type or a
 *  group. Products without a type are never among them. */
export async function getHitsForProductTypes(typeKeys: string[], storeIds: string[]): Promise<{ hit: ProductSearchHit; typeKey: string }[]> {
  if (typeKeys.length === 0 || storeIds.length === 0) return []
  const rows = await getDb()
    .select({ id: schema.products.id, key: schema.productTypes.key })
    .from(schema.products)
    .innerJoin(schema.productTypes, eq(schema.productTypes.id, schema.products.productTypeId))
    .where(inArray(schema.productTypes.key, typeKeys))
  const typeOf = new Map(rows.map((row) => [row.id, row.key]))
  const hits = await getHitsForProducts([...typeOf.keys()], storeIds)
  return hits.map((hit) => ({ hit, typeKey: typeOf.get(hit.productId)! }))
}
