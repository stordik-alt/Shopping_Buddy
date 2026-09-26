import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Receipt } from 'lucide-react'
import { CATEGORY_BAR_COLORS } from '@/components/dashboard/spending-breakdown'
import { expenseMonth, expenseMonths, monthSummary } from '@/lib/budget'
import { money, monthLabel, recordCountLabel, shortDate } from '@/lib/format'
import type { Expense } from '@/lib/types'

type View = 'categories' | 'dates'

/** The household's expenses month by month: how much went where (category, then subcategory) and
 *  every payment with its date — "kdy a co jsme zaplatili". A payment opens for correction. All the
 *  numbers come from lib/budget.ts (monthSummary); nothing is calculated here. */
export function ExpenseLedger({
  expenses,
  today,
  onAdd,
  onEdit,
}: {
  expenses: Expense[]
  /** The real date (`YYYY-MM-DD`); the overview opens on its month. */
  today: string
  onAdd: () => void
  onEdit: (expense: Expense) => void
}) {
  const months = useMemo(() => expenseMonths(expenses, today), [expenses, today])
  const [month, setMonth] = useState(expenseMonth(today))
  const [view, setView] = useState<View>('categories')
  const [open, setOpen] = useState<string | null>(null)
  const summary = useMemo(() => monthSummary(expenses, month), [expenses, month])
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
        <button onClick={onAdd} className="flex min-h-10 items-center gap-1.5 rounded-xl bg-primary/10 px-3 text-sm font-medium text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Plus className="h-4 w-4" aria-hidden="true" /> Přidat
        </button>
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

      {summary.categories.length === 0 ? (
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
              {summary.categories.map((entry) => {
                const expanded = open === entry.category
                const share = summary.total > 0 ? (entry.total / summary.total) * 100 : 0
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
                          <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                        </span>
                      </span>
                      <span className="mt-2 block h-2 overflow-hidden rounded-full bg-background">
                        <span className={`block h-full rounded-full ${CATEGORY_BAR_COLORS[entry.category]}`} style={{ width: `${share}%` }} />
                      </span>
                      <span className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                        {entry.subcategories.map((sub) => (
                          <span key={sub.subcategory ?? '-'} className="rounded-full bg-background px-2 py-0.5 break-words">
                            {sub.subcategory ?? 'Ostatní'} {money(sub.total)}
                          </span>
                        ))}
                      </span>
                    </button>
                    {expanded && <PaymentList expenses={entry.expenses} onEdit={onEdit} />}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-muted">
              <PaymentList expenses={byDate} onEdit={onEdit} showCategory />
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Payments, each one tap from its correction. */
function PaymentList({ expenses, onEdit, showCategory = false }: { expenses: Expense[]; onEdit: (expense: Expense) => void; showCategory?: boolean }) {
  return (
    <ul className="divide-y divide-border/60 px-2 pb-2">
      {expenses.map((expense) => (
        <li key={expense.id}>
          <button
            onClick={() => onEdit(expense)}
            className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                </span>
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold">{money(expense.amount)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
