import { and, asc, eq, gte, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { productTypeByKey } from '@/lib/product-types'
import { dismissalKey, lowStockLevels, type RestockCandidate, type StockLevel } from '@/lib/pantry-restock'
import type { ItemUnit, PantryItem } from '@/lib/types'

/** The household's wanted stock per product type (Profil ▸ Hlídané zásoby), by type name. */
export async function getStockLevels(householdId: string): Promise<StockLevel[]> {
  const rows = await getDb()
    .select({
      id: schema.householdStockLevels.id,
      key: schema.productTypes.key,
      name: schema.productTypes.name,
      minQuantity: schema.householdStockLevels.minQuantity,
      maxQuantity: schema.householdStockLevels.maxQuantity,
      unit: schema.householdStockLevels.unit,
    })
    .from(schema.householdStockLevels)
    .innerJoin(schema.productTypes, eq(schema.productTypes.id, schema.householdStockLevels.productTypeId))
    .where(eq(schema.householdStockLevels.householdId, householdId))
    .orderBy(asc(schema.productTypes.name))
  return rows.map((row) => ({ id: row.id, productTypeKey: row.key, typeName: productTypeByKey(row.key)?.name ?? row.name, minQuantity: row.minQuantity, maxQuantity: row.maxQuantity, unit: row.unit }))
}

/** Running promotions on any product of the product types that are near their minimum, optionally only
 *  at the given chains. Reads only when some type is near its minimum, so a household without stock
 *  levels costs nothing. Deciding which of them is worth suggesting is `restockSuggestions`
 *  (lib/pantry-restock.ts). */
export async function getRestockCandidates(levels: StockLevel[], items: PantryItem[], today: string, storeIds: string[] | null): Promise<RestockCandidate[]> {
  const typeKeys = [...new Set(lowStockLevels(levels, items).map(({ level }) => level.productTypeKey))]
  if (typeKeys.length === 0) return []
  if (storeIds != null && storeIds.length === 0) return []

  const list = (values: string[]) => sql.join(values.map((value) => sql`${value}`), sql`, `)
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
      AND pt.key IN (${list(typeKeys)})
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

/** The household's refused offers that are still running (`dismissalKey` of each). */
export async function getRestockDismissals(householdId: string, today: string): Promise<string[]> {
  const rows = await getDb()
    .select({ typeKey: schema.productTypes.key, productId: schema.restockDismissals.productId, validUntil: schema.restockDismissals.validUntil })
    .from(schema.restockDismissals)
    .innerJoin(schema.productTypes, eq(schema.productTypes.id, schema.restockDismissals.productTypeId))
    .where(and(eq(schema.restockDismissals.householdId, householdId), gte(schema.restockDismissals.validUntil, today)))
  return rows.map((row) => dismissalKey(row.typeKey, row.productId, String(row.validUntil).slice(0, 10)))
}
