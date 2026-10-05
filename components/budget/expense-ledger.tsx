import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Gauge, Loader2, Pencil, Plus, Receipt } from 'lucide-react'
import { CATEGORY_BAR_COLORS } from '@/components/dashboard/spending-breakdown'
import { PurchaseItemSplitDialog } from '@/components/budget/purchase-item-split-dialog'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { categoryRows, expensePeriod, expensePeriods, groupExpensesByPurchase, periodEnd, periodSummary, subcategoryGroups, type LedgerEntry, type SubcategoryGroup } from '@/lib/budget'
import { money, periodLabel, recordCountLabel, shortDate } from '@/lib/format'
import type { PurchaseExpenseItem } from '@/lib/db/purchase-items'
import type { ExpenseSplitPart } from '@/lib/purchase-expenses'
import type { CategoryBudgets, Expense, PurchaseItem } from '@/lib/types'

type View = 'categories' | 'dates'

/** The household's expenses month by month: how much went where (category, then subcategory) and
 *  every payment with its date — "kdy a co jsme zaplatili". A payment opens for correction. All the
 *  numbers come from lib/budget.ts (periodSummary); nothing is calculated here. */
export function ExpenseLedger({
  expenses,
  today,
  periodStartDay = 1,
  limits,
  onAdd,
  onEdit,
  onLimits,
  onLoadItems,
  onSaveSplits,
  extraPeriods = [],
  initialPeriod,
  onShowPeriod,
  loadingPeriod = null,
  periodError = null,
  onRetryPeriod,
}: {
  expenses: Expense[]
  /** The real date (`YYYY-MM-DD`); the overview opens on its month. */
  today: string
  /** Day of the month the household's budget period starts on (1 = calendar month). */
  periodStartDay?: number
  /** Limits per category (each period is measured against them). */
  limits: CategoryBudgets
  onAdd: () => void
  onEdit: (expense: Expense) => void
  onLimits: () => void
  /** The exact items behind a receipt-derived payment's amount (owner request, 2026-09-27: "přesné
   *  položky, než jen celou účtenku") — loaded when that payment is expanded, not up front. */
  onLoadItems: (purchaseId: string, category: Expense['category'], subcategory: string | null) => Promise<PurchaseExpenseItem[]>
  onSaveSplits: (purchaseItemId: string, splits: ExpenseSplitPart[]) => Promise<void>
  /** Past periods with spending whose expenses are not on the page yet (docs/15_BUDGET_PERIODS.md). */
  extraPeriods?: string[]
  /** The period to open on (a finished period chosen in Plán a úspory); the current one otherwise. */
  initialPeriod?: string
  /** Called with the period shown, so a past one is loaded. */
  onShowPeriod?: (period: string) => void
  loadingPeriod?: string | null
  periodError?: { period: string; message: string } | null
  onRetryPeriod?: () => void
}) {
  const months = useMemo(() => [...new Set([...expensePeriods(expenses, today, periodStartDay), ...extraPeriods])].sort().reverse(), [expenses, today, periodStartDay, extraPeriods])
  const [month, setMonth] = useState(initialPeriod ?? expensePeriod(today, periodStartDay))
  useEffect(() => {
    onShowPeriod?.(month)
  }, [month, onShowPeriod])
  const loading = loadingPeriod === month
  const failed = periodError?.period === month ? periodError.message : null
  const [view, setView] = useState<View>('categories')
  const [open, setOpen] = useState<string | null>(null)
  const summary = useMemo(() => periodSummary(expenses, month, periodStartDay), [expenses, month, periodStartDay])
  const rows = useMemo(() => categoryRows(summary, limits), [summary, limits])
  const index = months.indexOf(month)
  const byDate = useMemo(() => summary.categories.flatMap((entry) => entry.expenses).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), [summary])

  const go = (target: string | undefined) => {
    if (!target) return
    setMonth(target)
    setOpen(null)
  }

  return (
    <section className="surface p-5 sm:p-6" aria-label="Výdaje podle období">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Výdaje</p>
          <p className="mt-1 text-sm text-fg-secondary">Kdy a za co domácnost platila.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onLimits}>
            <Gauge aria-hidden="true" /> Limity
          </Button>
          <Button variant="secondary" onClick={onAdd}>
            <Plus aria-hidden="true" /> Přidat
          </Button>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        {/* Months are listed newest first, so "older" is the next index. */}
        <button onClick={() => go(months[index + 1])} disabled={index >= months.length - 1} aria-label="Starší období" className="icon-button shrink-0 disabled:opacity-30">
          <ChevronLeft aria-hidden="true" />
        </button>
        <select
          value={month}
          onChange={(event) => go(event.target.value)}
          aria-label="Období"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-center text-sm font-medium capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {months.map((option) => (
            <option key={option} value={option}>
              {periodLabel(option, periodEnd(option))}
            </option>
          ))}
        </select>
        <button onClick={() => go(months[index - 1])} disabled={index <= 0} aria-label="Novější období" className="icon-button shrink-0 disabled:opacity-30">
          <ChevronRight aria-hidden="true" />
        </button>
      </div>

      {failed ? (
        <div role="alert" className="mt-5 rounded-2xl bg-muted px-4 py-6 text-center text-sm">
          <p className="text-destructive">{failed}</p>
          <button type="button" onClick={onRetryPeriod} className="mt-3 min-h-10 rounded-xl px-3 font-medium text-accent-text hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Zkusit znovu
          </button>
        </div>
      ) : loading ? (
        <p className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-muted px-4 py-6 text-sm text-fg-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Načítám výdaje období…
        </p>
      ) : (
      <>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-2xl font-semibold tracking-tight">{money(summary.total)}</p>
        <p className="text-sm text-fg-muted">{recordCountLabel(byDate.length)}</p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5 rounded-2xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          <p>V tomto {periodStartDay === 1 ? 'měsíci' : 'období'} zatím žádné výdaje.</p>
          <button type="button" onClick={onAdd} className="mt-3 min-h-10 rounded-xl px-3 font-medium text-accent-text hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Zapsat první výdaj
          </button>
        </div>
      ) : (
        <>
          <SegmentedControl
            className="mt-4"
            label="Zobrazení výdajů"
            value={view}
            onChange={setView}
            options={[
              { value: 'categories', label: 'Podle kategorií' },
              { value: 'dates', label: 'Podle data' },
            ]}
          />

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
                    </button>
                    {expanded &&
                      (entry.expenses.length > 0 ? (
                        <SubcategoryList groups={subcategoryGroups(entry)} categoryTotal={entry.total} onEdit={onEdit} onLoadItems={onLoadItems} onSaveSplits={onSaveSplits} />
                      ) : (
                        <p className="px-4 pb-3 text-sm text-muted-foreground">V tomto {periodStartDay === 1 ? 'měsíci' : 'období'} zatím nic.</p>
                      ))}
                  </div>
                )
              })}
            </div>
          ) : (
            <DateList entries={groupExpensesByPurchase(byDate)} onEdit={onEdit} onLoadItems={onLoadItems} onSaveSplits={onSaveSplits} />
          )}
        </>
      )}
      </>
      )}
    </section>
  )
}

type ItemsState = { status: 'loading' } | { status: 'error' } | { status: 'done'; items: PurchaseExpenseItem[] }

type PaymentHandlers = {
  onEdit: (expense: Expense) => void
  onLoadItems: (purchaseId: string, category: Expense['category'], subcategory: string | null) => Promise<PurchaseExpenseItem[]>
  onSaveSplits: (purchaseItemId: string, splits: ExpenseSplitPart[]) => Promise<void>
}

// How many payments an opened subcategory shows before "Zobrazit další", and how many rows the list by
// date shows at a time — a month of receipts stays a short list (owner, 2026-10-05).
const SUBCATEGORY_PAGE = 5
const DATE_PAGE = 15

/** "Zobrazit další (N)" under a list that shows only its first part. */
function MoreButton({ hidden, onClick }: { hidden: number; onClick: () => void }) {
  if (hidden <= 0) return null
  return (
    <button type="button" onClick={onClick} className="mx-2 mb-2 min-h-11 rounded-xl px-3 text-sm font-medium text-accent-text hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      Zobrazit další ({hidden})
    </button>
  )
}

/** An opened category: one short row per subcategory (total, number of records, share of the category);
 *  a row opens its own payments, newest first, a few at a time. */
function SubcategoryList({ groups, categoryTotal, ...handlers }: { groups: SubcategoryGroup[]; categoryTotal: number } & PaymentHandlers) {
  const [open, setOpen] = useState<string | null>(null)
  const [shown, setShown] = useState(SUBCATEGORY_PAGE)
  return (
    <ul className="space-y-1 px-2 pb-2">
      {groups.map((group) => {
        const key = group.subcategory ?? '__none__'
        const expanded = open === key
        const share = categoryTotal > 0 ? (group.total / categoryTotal) * 100 : 0
        return (
          <li key={key} className="rounded-xl bg-background/60">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => {
                setOpen(expanded ? null : key)
                setShown(SUBCATEGORY_PAGE)
              }}
              className="w-full rounded-xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 break-words font-medium">{group.subcategory ?? 'Bez podkategorie'}</span>
                <span className="flex shrink-0 items-center gap-1 font-semibold">
                  {money(group.total)}
                  <ChevronDown className={`size-4 text-fg-muted transition ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                </span>
              </span>
              <span className="mt-1.5 flex items-center gap-3">
                <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-accent-solid" style={{ width: `${share}%` }} />
                </span>
                <span className="shrink-0 text-xs text-fg-muted">{recordCountLabel(group.expenses.length)}</span>
              </span>
            </button>
            {expanded && (
              <>
                <PaymentList expenses={group.expenses.slice(0, shown)} {...handlers} />
                <MoreButton hidden={group.expenses.length - shown} onClick={() => setShown((current) => current + SUBCATEGORY_PAGE)} />
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Výdaje by date: a receipt is one row again (its total, how many categories it was split into) and
 *  opens into the split parts, each still correctable; payments entered by hand are rows of their own. */
function DateList({ entries, ...handlers }: { entries: LedgerEntry[] } & PaymentHandlers) {
  const [open, setOpen] = useState<string | null>(null)
  const [shown, setShown] = useState(DATE_PAGE)
  return (
    <div className="mt-4 rounded-2xl bg-muted">
      <ul className="divide-y divide-border/60">
        {entries.slice(0, shown).map((entry) => {
          if (entry.kind === 'single') {
            return (
              <li key={entry.expense.id}>
                <PaymentList expenses={[entry.expense]} {...handlers} showCategory />
              </li>
            )
          }
          const expanded = open === entry.purchaseId
          const categories = new Set(entry.parts.map((part) => part.category)).size
          return (
            <li key={entry.purchaseId}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : entry.purchaseId)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background text-accent-text">
                    <Receipt className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-medium">{entry.note || 'Nákup z účtenky'}</span>
                    <span className="mt-0.5 block text-xs text-fg-muted">
                      {shortDate(entry.date)} · {categories === 1 ? entry.parts[0].category : `rozděleno do ${categories} kategorií`}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm font-semibold">
                  {money(entry.total)}
                  <ChevronDown className={`size-4 text-fg-muted transition ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                </span>
              </button>
              {expanded && (
                <div className="mx-2 mb-2 rounded-xl bg-background/60">
                  <PaymentList expenses={entry.parts} {...handlers} asParts />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <MoreButton hidden={entries.length - shown} onClick={() => setShown((current) => current + DATE_PAGE)} />
    </div>
  )
}

/** Payments, each one tap from its correction. A receipt-derived one also expands (a separate
 *  control from the tap-to-correct row) into the exact items behind its amount — "přesné položky,
 *  než jen celou účtenku" — each reassignable on the spot. */
function PaymentList({
  expenses,
  onEdit,
  onLoadItems,
  onSaveSplits,
  showCategory = false,
  asParts = false,
}: {
  expenses: Expense[]
  onEdit: (expense: Expense) => void
  onLoadItems: (purchaseId: string, category: Expense['category'], subcategory: string | null) => Promise<PurchaseExpenseItem[]>
  onSaveSplits: (purchaseItemId: string, splits: ExpenseSplitPart[]) => Promise<void>
  showCategory?: boolean
  /** The parts of one opened purchase: its store and date are already in the row above, so each part
   *  is named by where its amount went (subcategory or category), without the icon. */
  asParts?: boolean
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
                  {asParts ? (
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-medium">{expense.subcategory ?? expense.category}</span>
                      {expense.subcategory && <span className="mt-0.5 block text-xs text-fg-muted">{expense.category}</span>}
                    </span>
                  ) : (
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background text-accent-text">
                        <Receipt className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-medium">{expense.note || expense.subcategory || expense.category}</span>
                        <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-fg-muted">
                          <span>{shortDate(expense.date)}</span>
                          {showCategory && <span className="break-words">{expense.category}</span>}
                          {expense.subcategory && <span className="break-words">{expense.subcategory}</span>}
                          {expense.purchaseId && <span className="font-medium text-accent-text">z účtenky</span>}
                        </span>
                      </span>
                    </span>
                  )}
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
