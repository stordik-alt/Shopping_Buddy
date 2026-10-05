import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { and, asc, eq, isNotNull, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { describeError } from '@/lib/errors'
import { detectReceiptFileType } from '@/lib/receipt-image'
import type { ReceiptTruth } from '@/lib/receipt-eval'
import { extractedReceiptSchema, isRoundingLine } from '@/lib/receipts'
import { getReceiptFile } from '@/lib/storage'

// Builds the local receipt dataset for measuring a receipt reader (docs/18_RECEIPT_READER_LUNA.md).
// Read-only against production: one query for the photo-imported receipts that ended in a purchase,
// and a download of each photo from storage. Everything goes to RECEIPT_EVAL_DIR on this computer —
// receipts are personal data and are never written into the repository.
//
// Per receipt, in <dir>/<importId>/:
//   original.<ext>  the uploaded photo or PDF, unchanged
//   truth.json      the confirmed purchase: store, date, amount paid, lines (ReceiptTruth)
//   meta.json       how the receipt was read then, and whether the household corrected the reading
//
// Run: pnpm receipt-eval:export [limit]   (uses .env.local — production database and storage)

const OUT_DIR = process.env.RECEIPT_EVAL_DIR ?? 'C:/tmp/receipt-eval/dataset'

async function main() {
  const limit = Number(process.argv[2] ?? 500)
  const db = getDb()
  const imports = await db
    .select({
      id: schema.receiptImports.id,
      imageUrl: schema.receiptImports.imageUrl,
      ocrProvider: schema.receiptImports.ocrProvider,
      parserResult: schema.receiptImports.parserResult,
      purchaseId: schema.receiptImports.purchaseId,
      date: schema.purchases.date,
      total: schema.purchases.total,
      chain: schema.stores.chain,
    })
    .from(schema.receiptImports)
    .innerJoin(schema.purchases, eq(schema.purchases.id, schema.receiptImports.purchaseId))
    .leftJoin(schema.stores, eq(schema.stores.id, schema.purchases.storeId))
    .where(and(eq(schema.receiptImports.source, 'ocr'), isNotNull(schema.receiptImports.imageUrl)))
    .orderBy(asc(schema.receiptImports.createdAt))
    .limit(limit)
  const purchaseIds = imports.flatMap((row) => (row.purchaseId ? [row.purchaseId] : []))
  const lines =
    purchaseIds.length === 0
      ? []
      : await db
          .select({ purchaseId: schema.purchaseItems.purchaseId, name: schema.purchaseItems.name, quantity: schema.purchaseItems.quantity, unit: schema.purchaseItems.unit, price: schema.purchaseItems.price })
          .from(schema.purchaseItems)
          .where(inArray(schema.purchaseItems.purchaseId, purchaseIds))

  mkdirSync(OUT_DIR, { recursive: true })
  let written = 0
  for (const row of imports) {
    const dir = join(OUT_DIR, row.id)
    if (existsSync(join(dir, 'truth.json'))) continue
    try {
      const file = await getReceiptFile(row.imageUrl!)
      if (!file) throw new Error('photo not found in storage')
      const original = Buffer.from(await new Response(file.body).arrayBuffer())
      const type = detectReceiptFileType(original)
      if (type.kind !== 'supported') throw new Error(`unsupported file (${type.kind})`)

      const truth: ReceiptTruth = {
        store: row.chain,
        date: row.date,
        total: Number(row.total),
        items: lines
          .filter((line) => line.purchaseId === row.purchaseId)
          .map((line) => ({ name: line.name, quantity: line.quantity, unit: line.unit, paid: Math.round(line.quantity * Number(line.price) * 100) / 100 })),
      }
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `original.${type.extension}`), original)
      writeFileSync(join(dir, 'truth.json'), JSON.stringify(truth, null, 2))
      writeFileSync(
        join(dir, 'meta.json'),
        JSON.stringify({ ocrProvider: row.ocrProvider, mimeType: type.mimeType, bytes: original.length, truthSource: truthSource(row.parserResult, truth) }, null, 2),
      )
      written += 1
    } catch (error) {
      console.error(`${row.id}: ${describeError(error)}`)
    }
  }
  console.log(`${imports.length} photo-imported receipts with a purchase; ${written} newly written to ${OUT_DIR}`)
}

/** "corrected" when the purchase differs from what the parser read then — the household reviewed and
 *  changed it, so it is a checked answer; "as-read" when it is exactly the old reading, which may be
 *  equally wrong and is listed for a manual look when a new reader disagrees with it. */
function truthSource(parserResult: string | null, truth: ReceiptTruth): 'corrected' | 'as-read' | 'unknown' {
  if (!parserResult) return 'unknown'
  const parsed = extractedReceiptSchema.safeParse(JSON.parse(parserResult))
  if (!parsed.success) return 'unknown'
  const read = parsed.data.items.filter((item) => item.name.trim() && !isRoundingLine(item.name))
  const sameLines =
    read.length === truth.items.length &&
    read.every((item, index) => {
      const line = truth.items[index]
      const paid = (item.totalPrice ?? 0) - (item.discount ?? 0)
      return item.name === line.name && Math.abs(paid - line.paid) <= 0.05
    })
  return sameLines && parsed.data.total === truth.total ? 'as-read' : 'corrected'
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
