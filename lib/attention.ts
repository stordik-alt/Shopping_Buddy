import type { ReceiptImportState } from '@/lib/db/queries'
import { countLabel } from '@/lib/format'
import { activeDeals, type ProductPrice } from '@/lib/prices'
import type { Tab } from '@/lib/types'

// "Dnes je důležité" on the home screen: the few things that need the household's action now,
// gathered in one place instead of being spread across tabs or waiting under the bell. Pure and
// deterministic (CLAUDE.md sections 5 and 22) — built from data the page already has. Only things
// that call for a decision are listed; the budget warning is left out because the budget card right
// below already shows it. Nothing to report means no items, and the strip is not shown.

export type AttentionItem = {
  /** Stable key for the list. */
  id: string
  kind: 'receipt' | 'deal-ending'
  text: string
  /** Where the household acts on it. */
  tab: Tab
}

/** Receipt imports stopped on the household: a review, a duplicate decision, a failure, or one
 *  that stopped moving. Imports still processing normally are not the household's job. */
const RECEIPT_NEEDS_ACTION = new Set<ReceiptImportState['status']>(['review_required', 'duplicate_review', 'ocr_failed', 'parsing_failed'])

/** `YYYY-MM-DD` of the day after `isoDate`, computed in UTC so no local offset can shift it. */
function nextDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
}

export function attentionItems({
  today,
  receipts,
  productPrices,
  listNames,
}: {
  today: string
  receipts: ReceiptImportState[]
  productPrices: ProductPrice[]
  /** Names of the items still to buy. */
  listNames: string[]
}): AttentionItem[] {
  const items: AttentionItem[] = []

  const waiting = receipts.filter((receipt) => RECEIPT_NEEDS_ACTION.has(receipt.status) || receipt.stalled).length
  if (waiting > 0) {
    items.push({
      id: 'receipts',
      kind: 'receipt',
      text: `${countLabel(waiting, 'účtenka čeká', 'účtenky čekají', 'účtenek čeká')} na vaši kontrolu`,
      tab: 'Rozpočet',
    })
  }

  // A promotion on something the household is about to buy, ending today or tomorrow: after that
  // the saving is gone. One line per product, for its earliest-ending deal.
  const onList = new Set(listNames.map((name) => name.trim().toLowerCase()))
  const tomorrow = nextDay(today)
  const endingByProduct = new Map<string, { name: string; store: string; until: string }>()
  for (const { product, price } of activeDeals(productPrices, today)) {
    const until = price.dealValidUntil
    if (!until || until > tomorrow || !onList.has(product.productName.trim().toLowerCase())) continue
    const current = endingByProduct.get(product.productName)
    if (!current || until < current.until) endingByProduct.set(product.productName, { name: product.productName, store: price.store, until })
  }
  const ending = [...endingByProduct.values()].sort((a, b) => a.until.localeCompare(b.until) || a.name.localeCompare(b.name, 'cs'))
  for (const deal of ending) {
    items.push({
      id: `deal-${deal.name}-${deal.store}`,
      kind: 'deal-ending',
      text: `Akce na ${deal.name} končí ${deal.until === today ? 'dnes' : 'zítra'} · ${deal.store}`,
      tab: 'Nákup',
    })
  }

  return items
}
