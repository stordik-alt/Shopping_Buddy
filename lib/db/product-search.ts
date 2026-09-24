import { sql } from 'drizzle-orm'
import { TODAY } from '@/lib/budget'
import { getDb } from '@/lib/db/client'
import { likePattern, scoreMatch, splitTokens, toComparableUnit, type ProductSearchHit } from '@/lib/product-search'
import type { ItemCategory, ItemUnit } from '@/lib/types'

// Text search over the products the chains have prices for (lib/product-search.ts has the rules).
// Data is global — catalog and prices are not household-scoped — so nothing here needs a household;
// who may search is decided by the caller (`app/actions/product-search.ts`).

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
  regular_price: string
  unit: ItemUnit
  unit_price: string
  observed_at: string
}

type DealRow = { product_id: string; store_id: string; deal_price: string; valid_until: string }

/** Products whose name contains every token, each with its latest recorded price at each chain that
 *  has one, and the chain's active promotion when there is one. `storeIds`, when given, restricts the
 *  chains. Scored, unsorted — group and order with `groupHitsByChain()`. Tokens are matched as
 *  parameterized LIKE patterns with wildcards escaped, never spliced into SQL. */
export async function searchProductHits(tokens: string[], options: { storeIds?: string[]; category?: ItemCategory } = {}): Promise<ProductSearchHit[]> {
  if (tokens.length === 0) return []
  const db = getDb()
  // Words must match; sizes/strengths ("1l") only rank higher — names often omit them.
  const { required, optional } = splitTokens(tokens)
  const patterns = sql.join(required.map((token) => sql`${likePattern(token)}`), sql`, `)
  const chains = options.storeIds
  if (chains && chains.length === 0) return []
  const chainFilter = chains ? sql`AND pr.store_id IN (${sql.join(chains.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``
  const categoryFilter = options.category ? sql`AND c.name = ${options.category}` : sql``

  // The latest observation per product and chain is its current price (docs/03_DATABASE.md rule 14);
  // on the same day the retailer's own (OFFICIAL) price wins over a receipt-derived one.
  const priceRows = await db.execute<PriceRow>(sql`
    SELECT DISTINCT ON (pr.product_id, pr.store_id)
      pr.product_id, p.name, p.search_name, c.name AS category, pr.store_id, s.chain,
      pr.regular_price, pr.unit, pr.unit_price, pr.observed_at
    FROM prices pr
    JOIN products p ON p.id = pr.product_id
    JOIN product_categories c ON c.id = p.category_id
    JOIN stores s ON s.id = pr.store_id
    WHERE p.search_name LIKE ALL (ARRAY[${patterns}]::text[]) ${chainFilter} ${categoryFilter}
    ORDER BY pr.product_id, pr.store_id, pr.observed_at DESC, (pr.source_type = 'OFFICIAL') DESC
    LIMIT ${MAX_ROWS}
  `)
  if (priceRows.rows.length === 0) return []

  const deals = await loadActiveDeals([...new Set(priceRows.rows.map((row) => row.product_id))])

  return priceRows.rows
    .map((row) => rowToHit(row, deals, scoreMatch(row.search_name, required, optional)))
    .filter((hit) => hit.score > 0)
}

/** Active promotions (the same "active" rule the rest of the app uses) of a chain, at any branch or
 *  chain-wide (an online-only chain's deals have no branch), keyed by `productId|storeId`. */
async function loadActiveDeals(productIds: string[]): Promise<Map<string, DealRow>> {
  if (productIds.length === 0) return new Map()
  const db = getDb()
  const dealRows = await db.execute<DealRow>(sql`
    SELECT d.product_id, d.store_id, min(d.deal_price) AS deal_price, max(d.valid_until) AS valid_until
    FROM deals d
    WHERE d.valid_until >= ${TODAY}::date AND d.product_id IN (${sql.join(productIds.map((id) => sql`${id}::uuid`), sql`, `)})
    GROUP BY d.product_id, d.store_id
  `)
  return new Map(dealRows.rows.map((row) => [`${row.product_id}|${row.store_id}`, row]))
}

function rowToHit(row: PriceRow, deals: Map<string, DealRow>, score: number): ProductSearchHit {
  const deal = deals.get(`${row.product_id}|${row.store_id}`)
  const comparable = toComparableUnit(row.unit, Number(row.unit_price))
  return {
    productId: row.product_id,
    name: row.name,
    category: row.category,
    storeId: row.store_id,
    chain: row.chain,
    regularPrice: Number(row.regular_price),
    dealPrice: deal ? Number(deal.deal_price) : null,
    dealValidUntil: deal?.valid_until ?? null,
    unit: comparable.unit,
    unitPrice: comparable.unitPrice,
    observedAt: row.observed_at,
    score,
  }
}

/** The latest price (and active promotion) of specific products at the given chains — how a pinned
 *  product is priced. Unscored (score 0). A product with no price at a chain is simply absent. */
export async function getHitsForProducts(productIds: string[], storeIds: string[]): Promise<ProductSearchHit[]> {
  if (productIds.length === 0 || storeIds.length === 0) return []
  const db = getDb()
  const priceRows = await db.execute<PriceRow>(sql`
    SELECT DISTINCT ON (pr.product_id, pr.store_id)
      pr.product_id, p.name, p.search_name, c.name AS category, pr.store_id, s.chain,
      pr.regular_price, pr.unit, pr.unit_price, pr.observed_at
    FROM prices pr
    JOIN products p ON p.id = pr.product_id
    JOIN product_categories c ON c.id = p.category_id
    JOIN stores s ON s.id = pr.store_id
    WHERE pr.product_id IN (${sql.join(productIds.map((id) => sql`${id}::uuid`), sql`, `)})
      AND pr.store_id IN (${sql.join(storeIds.map((id) => sql`${id}::uuid`), sql`, `)})
    ORDER BY pr.product_id, pr.store_id, pr.observed_at DESC, (pr.source_type = 'OFFICIAL') DESC
  `)
  const deals = await loadActiveDeals([...new Set(priceRows.rows.map((row) => row.product_id))])
  return priceRows.rows.map((row) => rowToHit(row, deals, 0))
}
