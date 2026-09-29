import { useState } from 'react'
import { ChevronDown, Loader2, Pencil, PiggyBank, Repeat, ShoppingBag, Star, TrendingUp } from 'lucide-react'
import { averageMonthlySpend, favoriteStores, mostBoughtProducts, repeatPurchases } from '@/lib/purchase-history'
import { PurchaseItemSplitDialog } from '@/components/budget/purchase-item-split-dialog'
import { Stat } from '@/components/shared/stat'
import { userFacingError } from '@/lib/errors'
import { itemCountLabel, money, shortDate } from '@/lib/format'
import type { ExpenseSplitPart } from '@/lib/purchase-expenses'
import type { PurchaseItem, PurchaseRecord } from '@/lib/types'

// The newest few purchases are listed; the rest are one tap away, so the tab stays short.
const VISIBLE_PURCHASES = 5

export function PurchaseHistory({
  records,
  onSaveSplits,
  onRecordExpenses,
}: {
  records: PurchaseRecord[]
  /** Saves (or, with an empty array, clears) one item's expense-category split — a plain
   *  reassignment or, since a receipt often can't say, a genuine split across more than one target
   *  (e.g. clothing that was actually half a child's). */
  onSaveSplits: (purchaseItemId: string, splits: ExpenseSplitPart[]) => Promise<void>
  /** Records a receipt-derived purchase into the budget after the fact (`record.needsBudgetRecording`
   *  — one imported before receipts started counting as expenses, or otherwise missed). */
  onRecordExpenses: (purchaseId: string) => Promise<void>
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [editingItem, setEditingItem] = useState<(PurchaseItem & { id: string; category: NonNullable<PurchaseItem['category']> }) | null>(null)
  // The server action also revalidates, but that refresh happens on the app's own polling schedule
  // (CLAUDE.md section 10: lightweight polling, no realtime) — this makes a save stick on screen
  // immediately, the same way the store directory and the ideas admin screen already do.
  const [overrides, setOverrides] = useState<Record<string, ExpenseSplitPart[]>>({})
  const [recording, setRecording] = useState<string | null>(null)
  const [recorded, setRecorded] = useState<Record<string, boolean>>({})
  const [recordError, setRecordError] = useState<Record<string, string>>({})
  const splitsOf = (item: PurchaseItem) => (item.id != null && item.id in overrides ? overrides[item.id] : (item.expenseSplits ?? []))
  const newestFirst = records.slice().reverse()

  async function recordExpenses(purchaseId: string) {
    setRecording(purchaseId)
    setRecordError((current) => ({ ...current, [purchaseId]: '' }))
    try {
      await onRecordExpenses(purchaseId)
      setRecorded((current) => ({ ...current, [purchaseId]: true }))
    } catch (err) {
      setRecordError((current) => ({ ...current, [purchaseId]: userFacingError(err, 'Nákup se nepodařilo zapsat do rozpočtu.') }))
    } finally {
      setRecording(null)
    }
  }
  const shownRecords = showAll ? newestFirst : newestFirst.slice(0, VISIBLE_PURCHASES)

  const topStore = favoriteStores(records)[0]
  const topProduct = mostBoughtProducts(records, 1)[0]
  const repeats = repeatPurchases(records)

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-semibold">Historie nákupů</p>
        <p className="mt-1 text-sm text-muted-foreground">Dlouhodobé statistiky z uskutečněných nákupů domácnosti.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Běžná měsíční útrata" value={money(averageMonthlySpend(records))} icon={<TrendingUp />} />
        <Stat label="Oblíbený obchod" value={topStore ? `${topStore.store} (${topStore.count}×)` : '—'} icon={<Star />} />
        <Stat label="Nejčastěji kupované" value={topProduct ? `${topProduct.name} (${topProduct.count}×)` : '—'} icon={<ShoppingBag />} />
      </div>
      {repeats.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Repeat className="h-3.5 w-3.5" /> Opakované nákupy
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {repeats.map((entry) => (
              <span key={entry.name} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                {entry.name} · {entry.count}×
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="overflow-hidden surface">
        {shownRecords.map((record) => (
            <div key={record.id} className="border-b border-border last:border-0">
              <button
                onClick={() => setExpandedId((current) => (current === record.id ? null : record.id))}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {record.store ?? 'Neurčený obchod'} <span className="font-normal text-muted-foreground">· {shortDate(record.date)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{itemCountLabel(record.items.length)} {record.discount ? `· sleva ${record.discount} Kč` : ''}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold">{money(record.total)}</span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${expandedId === record.id ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {/* Shown on the collapsed row, not only once expanded, so a receipt that never reached the
                  budget is noticed without opening it. */}
              {record.needsBudgetRecording && !recorded[record.id] && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-4">
                  <p className="text-xs text-muted-foreground">Tento nákup zatím není v rozpočtu.</p>
                  <button
                    onClick={() => recordExpenses(record.id)}
                    disabled={recording === record.id}
                    className="flex min-h-9 items-center gap-1.5 rounded-full bg-primary/10 px-3 text-xs font-medium text-primary hover:bg-primary/15 disabled:opacity-60"
                  >
                    {recording === record.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <PiggyBank className="h-3.5 w-3.5" aria-hidden="true" />}
                    Zařadit do výdajů
                  </button>
                </div>
              )}
              {recordError[record.id] && (
                <p role="alert" className="px-5 pb-4 text-xs text-destructive">
                  {recordError[record.id]}
                </p>
              )}
              {expandedId === record.id && (
                <div className="space-y-1.5 border-t border-border bg-muted/40 px-5 py-4">
                  {record.items.map((item) => {
                    // Only a real, categorized database row can be reassigned — a purchase made
                    // before that column existed (`category` unknown) has nothing to base it on.
                    const canSplit = item.id != null && item.category != null
                    const splits = splitsOf(item)
                    return (
                      <div key={item.id ?? item.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                        <span className="min-w-0 flex-1">
                          {item.name} · {item.quantity} {item.unit}
                          {splits.length > 1 && <span className="ml-1.5 text-muted-foreground">· rozděleno na {splits.length} částí</span>}
                          {splits.length === 1 && <span className="ml-1.5 text-muted-foreground">· {splits[0].category}{splits[0].subcategory ? ` ▸ ${splits[0].subcategory}` : ''}</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="font-medium">{money(item.price * item.quantity)}</span>
                          {canSplit && (
                            <button
                              onClick={() => setEditingItem({ ...item, expenseSplits: splits } as PurchaseItem & { id: string; category: NonNullable<PurchaseItem['category']> })}
                              aria-label={`Upravit kategorii výdaje pro ${item.name}`}
                              className="icon-button size-7"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
      </div>
      {records.length > VISIBLE_PURCHASES && (
        <button
          onClick={() => setShowAll((current) => !current)}
          aria-expanded={showAll}
          className="flex min-h-10 items-center gap-1 rounded-full bg-muted px-4 text-sm font-medium transition hover:bg-primary/10"
        >
          {showAll ? 'Zobrazit méně' : `Zobrazit všechny nákupy (${records.length})`}
          <ChevronDown className={`h-4 w-4 transition ${showAll ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      )}
      {editingItem && (
        <PurchaseItemSplitDialog
          open={editingItem != null}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={async (splits) => {
            await onSaveSplits(editingItem.id, splits)
            setOverrides((current) => ({ ...current, [editingItem.id]: splits }))
          }}
        />
      )}
    </section>
  )
}
