export type PurchaseSavingsRecord = {
  id: string
  date: string
  discount: number | null
  /** A linked, confirmed receipt is evidence that this amount was actually discounted. */
  receiptSupported: boolean
}

export type PurchaseSavingsByMonth = {
  /** Calendar month (`YYYY-MM`), independent of the household's budget cycle. */
  month: string
  receiptReported: number
  declared: number
}

/** Adds each purchase at most once, even if a legacy receipt import was linked to it more than once.
 *  Manual purchase-entry discounts remain separate from amounts reported on a receipt. */
export function purchaseSavingsByMonth(records: PurchaseSavingsRecord[]): PurchaseSavingsByMonth[] {
  const seen = new Set<string>()
  const totals = new Map<string, PurchaseSavingsByMonth>()

  for (const record of records) {
    if (seen.has(record.id)) continue
    seen.add(record.id)
    if (record.discount == null || record.discount <= 0) continue

    const month = record.date.slice(0, 7)
    const row = totals.get(month) ?? { month, receiptReported: 0, declared: 0 }
    if (record.receiptSupported) row.receiptReported += record.discount
    else row.declared += record.discount
    totals.set(month, row)
  }

  return [...totals.values()]
    .map((row) => ({ ...row, receiptReported: roundMoney(row.receiptReported), declared: roundMoney(row.declared) }))
    .sort((a, b) => b.month.localeCompare(a.month))
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100
}
