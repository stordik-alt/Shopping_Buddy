import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Gauge, Loader2, Pencil, Plus, Receipt } from 'lucide-react'
import { CATEGORY_BAR_COLORS } from '@/components/dashboard/spending-breakdown'
import { PurchaseItemSplitDialog } from '@/components/budget/purchase-item-split-dialog'
import { categoryRows, expenseMonth, expenseMonths, monthSummary } from '@/lib/budget'
import { money, monthLabel, recordCountLabel, shortDate } from '@/lib/format'
import type { PurchaseExpenseItem } from '@/lib/db/purchase-items'
import type { ExpenseSplitPart } from '@/lib/purchase-expenses'
import type { CategoryBudgets, Expense, PurchaseItem } from '@/lib/types'

type View = 'categories' | 'dates'

/** The household's expenses month by month: how much went where (category, then subcategory) and
 *  every payment with its date — "kdy a co jsme zaplatili". A payment opens for correction. All the
 *  numbers come from lib/budget.ts (monthSummary); nothing is calculated here. */
export function ExpenseLedger({
  expenses,
  today,
  limits,
  onAdd,
  onEdit,
  onLimits,
  onLoadItems,
  onSaveSplits,
}: {
  expenses: Expense[]
  /** The real date (`YYYY-MM-DD`); the overview opens on its month. */
  today: string
  /** Monthly limits per category (each month is measured against them). */
  limits: CategoryBudgets
  onAdd: () => void
  onEdit: (expense: Expense) => void
  onLimits: () => void
  /** The exact items behind a receipt-derived payment's amount (owner request, 2026-09-27: "přesné
   *  položky, než jen celou účtenku") — loaded when that payment is expanded, not up front. */
  onLoadItems: (purchaseId: string, category: Expense['category'], subcategory: string | null) => Promise<PurchaseExpenseItem[]>
  onSaveSplits: (purchaseItemId: string, splits: ExpenseSplitPart[]) => Promise<void>
}) {
  const months = useMemo(() => expenseMonths(expenses, today), [expenses, today])
  const [month, setMonth] = useState(expenseMonth(today))
  const [view, setView] = useState<View>('categories')
  const [open, setOpen] = useState<string | null>(null)
  const summary = useMemo(() => monthSummary(expenses, month), [expenses, month])
  const rows = useMemo(() => categoryRows(summary, limits), [summary, limits])
  const index = months.indexOf(month)
  const byDate = useMemo(() => summary.categories.flatMap((entry) => entry.expenses).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), [summary])

  const go = (target: string | undefined) => {
    if (!target) return
    setMonth(target)
    setOpen(null)
  }

  return (
    <section className="surface p-5 sm:p-6" aria-label="Výdaje podle měsíců">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Výdaje</p>
          <p className="mt-1 text-sm text-muted-foreground">Kdy a za co domácnost platila.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onLimits} className="flex min-h-10 items-center gap-1.5 rounded-xl bg-muted px-3 text-sm font-medium hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Gauge className="h-4 w-4" aria-hidden="true" /> Limity
          </button>
          <button onClick={onAdd} className="flex min-h-10 items-center gap-1.5 rounded-xl bg-primary/10 px-3 text-sm font-medium text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Plus className="h-4 w-4" aria-hidden="true" /> Přidat
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        {/* Months are listed newest first, so "older" is the next index. */}
        <button onClick={() => go(months[index + 1])} disabled={index >= months.length - 1} aria-label="Starší měsíc" className="icon-button shrink-0 disabled:opacity-30">
          <ChevronLeft aria-hidden="true" />
        </button>
        <select
          value={month}
          onChange={(event) => go(event.target.value)}
          aria-label="Měsíc"
          className="min-h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-center text-sm font-medium capitalize"
        >
          {months.map((option) => (
            <option key={option} value={option}>
              {monthLabel(option)}
            </option>
          ))}
        </select>
        <button onClick={() => go(months[index - 1])} disabled={index <= 0} aria-label="Novější měsíc" className="icon-button shrink-0 disabled:opacity-30">
          <ChevronRight aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-2xl font-semibold tracking-tight">{money(summary.total)}</p>
        <p className="text-xs text-muted-foreground">{recordCountLabel(byDate.length)}</p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5 rounded-2xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          <p>V tomto měsíci zatím žádné výdaje.</p>
          <button onClick={onAdd} className="mt-3 min-h-10 rounded-xl px-3 font-medium text-primary hover:bg-primary/10">
            Zapsat první výdaj
          </button>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Zobrazení" className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-sm">
            {(
              [
                ['categories', 'Podle kategorií'],
                ['dates', 'Podle data'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={`min-h-10 rounded-lg px-2 font-medium ${view === key ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {view === 'categories' ? (
            <div className="mt-4 space-y-2">
              {rows.map((entry) => {
                const expanded = open === entry.category
                // With a limit the bar shows how much of it is used; without one, the category's share
                // of the month.
                const share = entry.limit != null ? Math.min(100, (entry.total / entry.limit) * 100) : summary.total > 0 ? (entry.total / summary.total) * 100 : 0
                return (
                  <div key={entry.category} className="rounded-2xl bg-muted">
                    <button
                      onClick={() => setOpen(expanded ? null : entry.category)}
                      aria-expanded={expanded}
                      className="w-full rounded-2xl px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4"
                    >
                      <span className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 break-words font-medium">{entry.category}</span>
                        <span className="flex shrink-0 items-center gap-1 font-semibold">
                          {money(entry.total)}
                          {entry.limit != null && <span className="font-normal text-muted-foreground">z {money(entry.limit)}</span>}
                          <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                        </span>
                      </span>
                      <span className="mt-2 block h-2 overflow-hidden rounded-full bg-background">
                        <span className={`block h-full rounded-full ${entry.level === 'over' ? 'bg-destructive' : CATEGORY_BAR_COLORS[entry.category]}`} style={{ width: `${share}%` }} />
                      </span>
                      {/* The warning in words and an icon, never colour alone. */}
                      {entry.limit != null && entry.level !== 'ok' && (
                        <span className={`mt-2 flex items-center gap-1 text-xs font-medium ${entry.level === 'over' ? 'text-destructive' : 'text-foreground'}`}>
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {entry.level === 'over' ? `Limit překročen o ${money(entry.total - entry.limit)}` : 'Přes 80 % limitu'}
                        </span>
                      )}
                      <span className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                        {entry.subcategories.map((sub) => (
                          <span key={sub.subcategory ?? '-'} className="rounded-full bg-background px-2 py-0.5 break-words">
                            {sub.subcategory ?? 'Ostatní'} {money(sub.total)}
                          </span>
                        ))}
                      </span>
                    </button>
                    {expanded &&
                      (entry.expenses.length > 0 ? (
                        <PaymentList expenses={entry.expenses} onEdit={onEdit} onLoadItems={onLoadItems} onSaveSplits={onSaveSplits} />
                      ) : (
                        <p className="px-4 pb-3 text-sm text-muted-foreground">V tomto měsíci zatím nic.</p>
                      ))}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-muted">
              <PaymentList expenses={byDate} onEdit={onEdit} onLoadItems={onLoadItems} onSaveSplits={onSaveSplits} showCategory />
            </div>
          )}
        </>
      )}
    </section>
  )
}

type ItemsState = { status: 'loading' } | { status: 'error' } | { status: 'done'; items: PurchaseExpenseItem[] }

/** Payments, each one tap from its correction. A receipt-derived one also expands (a separate
 *  control from the tap-to-correct row) into the exact items behind its amount — "přesné položky,
 *  než jen celou účtenku" — each reassignable on the spot. */
function PaymentList({
  expenses,
  onEdit,
  onLoadItems,
  onSaveSplits,
  showCategory = false,
}: {
  expenses: Expense[]
  onEdit: (expense: Expense) => void
  onLoadItems: (purchaseId: string, category: Expense['category'], subcategory: string | null) => Promise<PurchaseExpenseItem[]>
  onSaveSplits: (purchaseItemId: string, splits: ExpenseSplitPart[]) => Promise<void>
  showCategory?: boolean
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [itemsByExpense, setItemsByExpense] = useState<Record<string, ItemsState>>({})
  const [editingItem, setEditingItem] = useState<{ expenseId: string; item: PurchaseItem & { id: string; category: NonNullable<PurchaseItem['category']> } } | null>(null)

  function toggle(expense: Expense) {
    const willOpen = expandedId !== expense.id
    setExpandedId(willOpen ? expense.id : null)
    if (willOpen && expense.purchaseId && !(expense.id in itemsByExpense)) {
      setItemsByExpense((current) => ({ ...current, [expense.id]: { status: 'loading' } }))
      onLoadItems(expense.purchaseId, expense.category, expense.subcategory)
        .then((items) => setItemsByExpense((current) => ({ ...current, [expense.id]: { status: 'done', items } })))
        .catch((error) => {
          console.error('Loading the expense\'s items failed', error)
          setItemsByExpense((current) => ({ ...current, [expense.id]: { status: 'error' } }))
        })
    }
  }

  async function saveSplits(splits: ExpenseSplitPart[]) {
    if (!editingItem) return
    await onSaveSplits(editingItem.item.id, splits)
    // The item just moved, possibly out of this expense's category — refetch so the list reflects it.
    const expense = expenses.find((entry) => entry.id === editingItem.expenseId)
    if (expense?.purchaseId) {
      const items = await onLoadItems(expense.purchaseId, expense.category, expense.subcategory).catch(() => null)
      if (items) setItemsByExpense((current) => ({ ...current, [expense.id]: { status: 'done', items } }))
    }
  }

  return (
    <>
      <ul className="divide-y divide-border/60 px-2 pb-2">
        {expenses.map((expense) => {
          const expanded = expandedId === expense.id
          const itemsState = itemsByExpense[expense.id]
          return (
            <li key={expense.id}>
              <div className="flex w-full min-w-0 items-center gap-1">
                <button
                  onClick={() => onEdit(expense)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background text-primary">
                      <Receipt className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-medium">{expense.note || expense.subcategory || expense.category}</span>
                      <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span>{shortDate(expense.date)}</span>
                        {showCategory && <span className="break-words">{expense.category}</span>}
                        {expense.subcategory && <span className="break-words">{expense.subcategory}</span>}
                        {expense.purchaseId && <span className="font-medium text-primary">z účtenky</span>}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold">{money(expense.amount)}</span>
                </button>
                {expense.purchaseId && (
                  <button
                    onClick={() => toggle(expense)}
                    aria-expanded={expanded}
                    aria-label={expanded ? 'Skrýt položky nákupu' : 'Zobrazit přesné položky nákupu'}
                    className="icon-button size-9 shrink-0"
                  >
                    <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                )}
              </div>
              {expanded && expense.purchaseId && (
                <div className="mb-2 ml-2 space-y-1.5 rounded-xl bg-background px-3 py-2.5">
                  {!itemsState || itemsState.status === 'loading' ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Načítám položky…
                    </p>
                  ) : itemsState.status === 'error' ? (
                    <p className="text-xs text-destructive">Položky se nepodařilo načíst.</p>
                  ) : itemsState.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">U položek tohoto nákupu neznáme kategorii.</p>
                  ) : (
                    itemsState.items.map((item) => (
                      <div key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                        <span className="min-w-0 flex-1">
                          {item.name} · {item.quantity} {item.unit}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="font-medium">{money(item.matchedAmount)}</span>
                          <button
                            onClick={() =>
                              setEditingItem({
                                expenseId: expense.id,
                                item: { id: item.id, name: item.name, quantity: item.quantity, unit: item.unit, price: item.price, category: item.category!, expenseSplits: item.expenseSplits },
                              })
                            }
                            aria-label={`Upravit kategorii výdaje pro ${item.name}`}
                            className="icon-button size-7"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {editingItem && <PurchaseItemSplitDialog open={editingItem != null} item={editingItem.item} onClose={() => setEditingItem(null)} onSave={saveSplits} />}
    </>
  )
}
