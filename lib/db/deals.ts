import { and, asc, eq, sql, type SQL } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { getProductPrices } from '@/lib/db/queries'
import * as schema from '@/lib/db/schema'
import { DEALS_PAGE_SIZE, type DealCategoryFilter } from '@/lib/deals-browse'
import type { StandaloneOffer } from '@/lib/offers'
import { clampPage } from '@/lib/paging'
import { assessDealQuality, type DealAssessment } from '@/lib/prices'
import { todayInPrague } from '@/lib/today'
import type { ItemCategory, ItemUnit } from '@/lib/types'

// The Akce tab's server-side browsing of today's promotions. The home screen used to load every
// promoted product's full price detail (every store, its whole history) on every render just to list
// them — most of the database's compute (docs/07_CHANGELOG.md, 2026-09-26). Here a lean query first
// finds which (product, chain) pairs are on the requested page — at most `DEALS_PAGE_SIZE`, whether
// they turn out to have a comparable regular price or not — and only their full detail is then
// loaded, through `getProductPrices()` (the same function the rest of the app uses, so "is this
// really the best price?" is not judged twice, in two different ways).

export type DealsPage = {
  /** Promotions with a real regular price to compare against. */
  deals: DealAssessment[]
  /** Promotions with no matching regular price — a retailer that publishes only its current offers
   *  (e.g. Penny); no discount is invented for these (CLAUDE.md sections 15 and 18). */
  offers: StandaloneOffer[]
  /** Every matching (product, chain) pair, across every page — `deals.length + offers.length` on the
   *  last page, `DEALS_PAGE_SIZE` on every other one. Deliberately one shared, paged total: an
   *  earlier version paged only `deals` and left every matching offer unpaged on top, which could
   *  still be hundreds long — the same "too many to scroll through" problem this tab exists to fix. */
  total: number
  page: number
}

function filters(today: string, category: DealCategoryFilter, chain: string | null): SQL[] {
  const clauses = [sql`${schema.deals.validFrom} <= ${today}::date`, sql`${schema.deals.validUntil} >= ${today}::date`]
  if (category !== 'all') clauses.push(eq(schema.productCategories.name, category))
  if (chain) clauses.push(eq(schema.stores.chain, chain))
  return clauses
}

/** One page of today's running promotions, by product name then chain for stable, predictable paging
 *  (there is no reliable single "best" ordering across differently-discounted products of different
 *  categories). `total` counts every matching pair; a page past the end falls back to the last one. */
export async function getDealsPage(options: { category: DealCategoryFilter; chain: string | null; page: number }): Promise<DealsPage> {
  const db = getDb()
  const today = todayInPrague()
  const where = and(...filters(today, options.category, options.chain))

  const base = () =>
    db
      .select({
        productName: schema.products.name,
        category: schema.productCategories.name,
        chain: schema.stores.chain,
        storeId: schema.stores.id,
        dealPrice: schema.deals.dealPrice,
        unit: schema.deals.unit,
        unitPrice: schema.deals.unitPrice,
        validUntil: schema.deals.validUntil,
      })
      .from(schema.deals)
      .innerJoin(schema.products, eq(schema.products.id, schema.deals.productId))
      .innerJoin(schema.productCategories, eq(schema.productCategories.id, schema.products.categoryId))
      .innerJoin(schema.stores, eq(schema.stores.id, schema.deals.storeId))
      .where(where)

  // A plain count first: the `deals` table is small (a few thousand rows in total), so this and the
  // page query below stay cheap regardless of how many products are on promotion — unlike loading
  // every one of them in full.
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.deals)
    .innerJoin(schema.products, eq(schema.products.id, schema.deals.productId))
    .innerJoin(schema.productCategories, eq(schema.productCategories.id, schema.products.categoryId))
    .innerJoin(schema.stores, eq(schema.stores.id, schema.deals.storeId))
    .where(where)
  if (total === 0) return { deals: [], offers: [], total: 0, page: 1 }

  const page = clampPage(options.page, total, DEALS_PAGE_SIZE)
  const rows = await base()
    .orderBy(asc(schema.products.name), asc(schema.stores.chain), asc(schema.deals.id))
    .limit(DEALS_PAGE_SIZE)
    .offset((page - 1) * DEALS_PAGE_SIZE)

  // Only this page's products' full detail is loaded — every store's price, for "is this really the
  // best price anywhere?" — never the whole promoted catalog.
  const names = [...new Set(rows.map((row) => row.productName))]
  const fullPrices = names.length > 0 ? await getProductPrices({ names, runningDeals: false }) : []

  const key = (productName: string, chain: string) => `${productName}\u0000${chain}`
  const wanted = new Map(rows.map((row, index) => [key(row.productName, row.chain), index]))
  const deals = assessDealQuality(fullPrices, today).filter((entry) => wanted.has(key(entry.product.productName, entry.price.store)))
  deals.sort((a, b) => wanted.get(key(a.product.productName, a.price.store))! - wanted.get(key(b.product.productName, b.price.store))!)

  // A page row assessDealQuality could not fold a real price into (no matching `prices` row, or one
  // at a different branch than the deal's own) is shown as an offer instead — the same distinction
  // `getStandaloneOffers()` makes, from the same page's own columns, so no second query is needed.
  const matched = new Set(deals.map((entry) => key(entry.product.productName, entry.price.store)))
  const offers: StandaloneOffer[] = rows
    .filter((row) => !matched.has(key(row.productName, row.chain)))
    .map((row) => ({
      productName: row.productName,
      category: row.category as ItemCategory,
      store: row.chain,
      storeId: row.storeId,
      dealPrice: Number(row.dealPrice),
      unit: row.unit as ItemUnit | null,
      unitPrice: row.unitPrice == null ? null : Number(row.unitPrice),
      validUntil: row.validUntil,
    }))

  return { deals, offers, total, page }
}
