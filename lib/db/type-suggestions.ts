// Product-type suggestions for receipt lines: the typed catalog products whose names are closest to
// the printed line (trigram similarity on `products.search_name`, indexed since migration 0039) vote
// for their types (lib/type-suggestions.ts). The catalog is global, so nothing here is
// household-scoped; the caller decides who may see the result.

import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { normalizeProductText } from '@/lib/product-normalize'
import { receiptTypeText } from '@/lib/receipt-product-match'
import { productTypeByKey } from '@/lib/product-types'
import { rankTypeSuggestions, type TypeNeighbour } from '@/lib/type-suggestions'

/** Typed products read per line. Five is what the measurement used. */
const NEIGHBOURS_PER_LINE = 5

type NeighbourRow = { line: number; type_key: string; similarity: number | string }

/** Offered types for each of `lineNames` (same order); an empty list where no close product exists.
 *  One query for the whole receipt. The line is read with its abbreviations spelled out and its
 *  chain's own brand dropped (receiptTypeText), like the type rules read it. */
export async function suggestTypesForReceiptLines(lineNames: string[]): Promise<Array<{ key: string; name: string }[]>> {
  const lines = lineNames
    .map((name, index) => ({ index, text: normalizeProductText(receiptTypeText(name)) }))
    .filter((line) => line.text.length > 0)
  if (lines.length === 0) return lineNames.map(() => [])

  const values = sql.join(lines.map((line) => sql`(${line.index}::int, ${line.text}::text)`), sql`, `)
  const result = await getDb().execute<NeighbourRow>(sql`
    SELECT l.line, n.type_key, n.similarity
    FROM (VALUES ${values}) AS l(line, text)
    CROSS JOIN LATERAL (
      SELECT pt.key AS type_key, similarity(p.search_name, l.text) AS similarity
      FROM products p
      JOIN product_types pt ON pt.id = p.product_type_id
      WHERE p.search_name % l.text
      ORDER BY p.search_name <-> l.text
      LIMIT ${NEIGHBOURS_PER_LINE}
    ) AS n
  `)

  const byLine = new Map<number, TypeNeighbour[]>()
  for (const row of result.rows) {
    const list = byLine.get(row.line) ?? []
    list.push({ typeKey: row.type_key, similarity: Number(row.similarity) })
    byLine.set(row.line, list)
  }
  return lineNames.map((_, index) =>
    rankTypeSuggestions(byLine.get(index) ?? []).flatMap((suggestion) => {
      // A type in the database the code does not know yet (code behind a migration) is not offered.
      const definition = productTypeByKey(suggestion.key)
      return definition ? [{ key: definition.key, name: definition.name }] : []
    }),
  )
}
