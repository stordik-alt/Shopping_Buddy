import { useState } from 'react'
import { ChevronDown, Loader2, Repeat, ShoppingBag, Star, TrendingUp } from 'lucide-react'
import { averageMonthlySpend, favoriteStores, mostBoughtProducts, repeatPurchases } from '@/lib/purchase-history'
import { Stat } from '@/components/shared/stat'
import { EXPENSE_CATEGORY_NAMES, subcategoriesOf, type ExpenseCategory } from '@/lib/expense-categories'
import { userFacingError } from '@/lib/errors'
import { itemCountLabel, money, shortDate } from '@/lib/format'
import type { PurchaseItem, PurchaseRecord } from '@/lib/types'

// The newest few purchases are listed; the rest are one tap away, so the tab stays short.
const VISIBLE_PURCHASES = 5

export function PurchaseHistory({
  records,
  onReassignItem,
}: {
  records: PurchaseRecord[]
  /** Sets (`category` non-null) or clears (`category: null`) one item's expense-category override —
   *  e.g. a gift bought during an otherwise ordinary grocery trip. */
  onReassignItem: (purchaseItemId: string, category: ExpenseCategory | null, subcategory: string | null) => Promise<void>
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const newestFirst = records.slice().reverse()
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
              {expandedId === record.id && (
                <div className="space-y-1.5 border-t border-border bg-muted/40 px-5 py-4">
                  {record.items.map((item) => (
                    <PurchaseHistoryItemRow key={item.id ?? item.name} item={item} onReassignItem={onReassignItem} />
                  ))}
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
    </section>
  )
}

/** One line of a purchase, with — when the item is a real, categorized database row — a way to move
 *  it to a different expense category/subcategory than the automatic mapping chose (owner request,
 *  2026-09-27: "abychom třeba pokryli nákup dárků"). An item from a purchase made before this
 *  existed (`category` unknown) is shown plainly instead, since there is nothing to base a
 *  reassignment on. */
function PurchaseHistoryItemRow({
  item,
  onReassignItem,
}: {
  item: PurchaseItem
  onReassignItem: (purchaseItemId: string, category: ExpenseCategory | null, subcategory: string | null) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The server action also revalidates, but that refresh happens on the app's own polling schedule
  // (CLAUDE.md section 10: lightweight polling, no realtime) — this makes the choice stick on screen
  // immediately, the same way the store directory and the ideas admin screen already do.
  const [current, setCurrent] = useState({ category: item.expenseCategory ?? null, subcategory: item.expenseSubcategory ?? null })

  const canReassign = item.id != null && item.category != null

  async function changeCategory(next: ExpenseCategory | 'auto') {
    if (!item.id) return
    const target = next === 'auto' ? { category: null, subcategory: null } : { category: next, subcategory: null }
    setBusy(true)
    setError('')
    try {
      await onReassignItem(item.id, target.category, target.subcategory)
      setCurrent(target)
    } catch (err) {
      setError(userFacingError(err, 'Kategorii se nepodařilo změnit.'))
    } finally {
      setBusy(false)
    }
  }

  async function changeSubcategory(next: string) {
    if (!item.id || !current.category) return
    const subcategory = next || null
    setBusy(true)
    setError('')
    try {
      await onReassignItem(item.id, current.category, subcategory)
      setCurrent({ category: current.category, subcategory })
    } catch (err) {
      setError(userFacingError(err, 'Podkategorii se nepodařilo změnit.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
      <span className="min-w-0 flex-1">
        {item.name} · {item.quantity} {item.unit}
      </span>
      <span className="font-medium">{money(item.price * item.quantity)}</span>
      {canReassign && (
        <div className="flex w-full flex-wrap items-center gap-1.5 text-muted-foreground">
          <select
            aria-label={`Kategorie výdaje pro ${item.name}`}
            value={current.category ?? 'auto'}
            disabled={busy}
            onChange={(event) => void changeCategory(event.target.value as ExpenseCategory | 'auto')}
            className="min-h-8 rounded-lg border border-input bg-background px-2 py-1 text-xs disabled:opacity-60"
          >
            <option value="auto">Automaticky</option>
            {EXPENSE_CATEGORY_NAMES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          {current.category && (
            <select
              aria-label={`Podkategorie výdaje pro ${item.name}`}
              value={current.subcategory ?? ''}
              disabled={busy}
              onChange={(event) => void changeSubcategory(event.target.value)}
              className="min-h-8 rounded-lg border border-input bg-background px-2 py-1 text-xs disabled:opacity-60"
            >
              <option value="">Bez podkategorie</option>
              {subcategoriesOf(current.category).map((subcategory) => (
                <option key={subcategory} value={subcategory}>
                  {subcategory}
                </option>
              ))}
            </select>
          )}
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {error && <span className="text-destructive">{error}</span>}
        </div>
      )}
    </div>
  )
}
