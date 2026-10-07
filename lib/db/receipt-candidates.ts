import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { likePattern } from '@/lib/product-search'
import { rankReceiptCandidates, receiptSearchWords, type ReceiptCandidate, type ReceiptSuggestions } from '@/lib/receipt-product-match'

// Finds the catalog products a receipt's lines could be (lib/receipt-product-match.ts has the rules).
// The catalog is global, so nothing here is household-scoped; the caller decides who may see it.
//
// Candidates are only products a retailer itself lists — ones with a price that did not come from a
// receipt. A product that exists only because an earlier receipt line was saved under its printed
// abbreviation ("KUR.PRSA") is never suggested: linking to it would keep the duplicate alive instead
// of tying the line to the real product.

/** Rows read per receipt line at most. The longest word of the line is required, and names that also
 *  contain the second word come first, so the cut drops the weakest candidates. */
const CANDIDATES_PER_LINE = 80

type CandidateRow = {
  line: number
  product_id: string
  name: string
  store_ids: string[]
  seed_package_references: ReceiptCandidate['seedPackageReferences']
}

/** Suggestions for each of `lineNames` (same order), from one query for the whole receipt. `storeId`
 *  is the receipt's chain: its products win a tie, but other chains' products are suggested too — the
 *  same Philadelphia 125 g is one product wherever it was bought. */
export async function suggestProductsForReceiptLines(lineNames: string[], storeId: string | null): Promise<ReceiptSuggestions[]> {
  const empty: ReceiptSuggestions = { suggestions: [], confident: false }
  const lines = lineNames.map((name, index) => ({ index, words: receiptSearchWords(name) })).filter((line) => line.words.length > 0)
  if (lines.length === 0) return lineNames.map(() => empty)

  const values = sql.join(
    lines.map((line) => sql`(${line.index}::int, ${likePattern(line.words[0])}::text, ${line.words[1] ? likePattern(line.words[1]) : null}::text)`),
    sql`, `,
  )
  const rows = await getDb().execute<CandidateRow>(sql`
    SELECT l.line, c.product_id, c.name, c.store_ids
    FROM (VALUES ${values}) AS l(line, required, preferred)
    CROSS JOIN LATERAL (
      SELECT p.id AS product_id, p.name,
        array(SELECT DISTINCT pr.store_id::text FROM prices pr WHERE pr.product_id = p.id AND pr.source_type <> 'RECEIPT') AS store_ids,
        coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'resolution', spr.resolution,
            'options', spr.package_options
          ))
          FROM seed_package_references spr
          WHERE spr.product_id = p.id
        ), '[]'::jsonb) AS seed_package_references
      FROM products p
      WHERE p.search_name LIKE l.required
        AND EXISTS (SELECT 1 FROM prices pr WHERE pr.product_id = p.id AND pr.source_type <> 'RECEIPT')
      ORDER BY (l.preferred IS NOT NULL AND p.search_name LIKE l.preferred) DESC, length(p.name), p.id
      LIMIT ${CANDIDATES_PER_LINE}
    ) AS c
  `)

  const byLine = new Map<number, ReceiptCandidate[]>()
  for (const row of rows.rows) {
    const candidates = byLine.get(row.line) ?? []
    candidates.push({
      productId: row.product_id,
      name: row.name,
      storeIds: row.store_ids,
      seedPackageReferences: row.seed_package_references ?? [],
    })
    byLine.set(row.line, candidates)
  }
  return lineNames.map((name, index) => (byLine.has(index) ? rankReceiptCandidates(name, storeId, byLine.get(index)!) : empty))
}
