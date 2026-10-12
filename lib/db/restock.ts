import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { isNearMinimum, type RestockCandidate } from '@/lib/pantry-restock'
import type { ItemUnit, PantryItem } from '@/lib/types'

/** Running promotions on the products behind the household's pantry rows that are near their minimum
 *  (the row's own product, or any product of the row's type), optionally only at the given chains.
 *  Reads only when some row is near its minimum, so a household without stock levels costs nothing.
 *  Deciding which of them is worth suggesting is `restockSuggestions` (lib/pantry-restock.ts). */
export async function getRestockCandidates(items: PantryItem[], today: string, storeIds: string[] | null): Promise<RestockCandidate[]> {
  const low = items.filter(isNearMinimum)
  if (low.length === 0) return []
  const productIds = [...new Set(low.flatMap((item) => (item.productId ? [item.productId] : [])))]
  const typeKeys = [...new Set(low.flatMap((item) => (item.productTypeKey ? [item.productTypeKey] : [])))]
  if (productIds.length === 0 && typeKeys.length === 0) return []
  if (storeIds != null && storeIds.length === 0) return []

  const list = (values: string[]) => sql.join(values.map((value) => sql`${value}`), sql`, `)
  const matches = [productIds.length > 0 ? sql`p.id IN (${sql.join(productIds.map((id) => sql`${id}::uuid`), sql`, `)})` : null, typeKeys.length > 0 ? sql`pt.key IN (${list(typeKeys)})` : null].filter((part) => part != null)
  const rows = await getDb().execute<{
    product_id: string
    name: string
    type_key: string | null
    store_id: string
    chain: string
    deal_price: string
    unit: ItemUnit | null
    unit_price: string | null
    regular_price: string | null
    valid_until: string
  }>(sql`
    SELECT d.product_id, p.name, pt.key AS type_key, s.id AS store_id, s.chain, d.deal_price, d.unit, d.unit_price,
      rp.regular_price, d.valid_until
    FROM deals d
    JOIN products p ON p.id = d.product_id
    LEFT JOIN product_types pt ON pt.id = p.product_type_id
    JOIN stores s ON s.id = d.store_id
    LEFT JOIN LATERAL (
      SELECT pr.regular_price FROM prices pr
      WHERE pr.product_id = d.product_id AND pr.store_id = d.store_id
      ORDER BY pr.observed_at DESC LIMIT 1
    ) rp ON true
    WHERE d.valid_from <= ${today}::date AND d.valid_until >= ${today}::date
      AND (${sql.join(matches, sql` OR `)})
      ${storeIds != null ? sql`AND d.store_id IN (${sql.join(storeIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``}
  `)
  return rows.rows.map((row) => ({
    productId: row.product_id,
    productName: row.name,
    productTypeKey: row.type_key,
    storeId: row.store_id,
    chain: row.chain,
    dealPrice: Number(row.deal_price),
    unit: row.unit,
    unitPrice: row.unit_price == null ? null : Number(row.unit_price),
    regularPrice: row.regular_price == null ? null : Number(row.regular_price),
    validUntil: String(row.valid_until).slice(0, 10),
  }))
}
