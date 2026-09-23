import type { PurchaseRecord } from '@/lib/types'

export function monthlyTotals(records: PurchaseRecord[]) {
  const totals = new Map<string, number>()
  for (const record of records) {
    const month = record.date.slice(0, 7)
    totals.set(month, (totals.get(month) ?? 0) + record.total)
  }
  return Array.from(totals.entries())
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

export function averageMonthlySpend(records: PurchaseRecord[]) {
  const totals = monthlyTotals(records)
  if (totals.length === 0) return 0
  return totals.reduce((sum, entry) => sum + entry.total, 0) / totals.length
}

export function mostBoughtProducts(records: PurchaseRecord[], limit = 5) {
  const counts = new Map<string, number>()
  for (const record of records) {
    for (const item of record.items) counts.set(item.name, (counts.get(item.name) ?? 0) + item.quantity)
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function repeatPurchases(records: PurchaseRecord[]) {
  const purchaseCounts = new Map<string, number>()

  // Count each product once per purchase, so quantity or duplicate OCR lines
  // inside one receipt cannot inflate the number of purchase events.
  for (const record of records) {
    const uniqueNames = new Set(record.items.map((item) => item.name))
    for (const name of uniqueNames) {
      purchaseCounts.set(name, (purchaseCounts.get(name) ?? 0) + 1)
    }
  }

  // "Repeated" means a product has appeared in at least three separate
  // purchase records. A single re-buy is not enough to call it a regular item.
  return Array.from(purchaseCounts.entries())
    .filter(([, count]) => count >= 3)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

export function favoriteStores(records: PurchaseRecord[]) {
  const counts = new Map<string, number>()
  for (const record of records) {
    if (!record.store) continue // no known store for this purchase — don't count it toward any store's total
    counts.set(record.store, (counts.get(record.store) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([store, count]) => ({ store, count }))
    .sort((a, b) => b.count - a.count)
}
