import type { ReactNode } from 'react'
import { CalendarClock, Plus, TrendingDown, TrendingUp } from 'lucide-react'
import { BudgetHero } from '@/components/budget/budget-hero'
import { CATEGORY_BAR_COLORS } from '@/components/dashboard/spending-breakdown'
import { Stat } from '@/components/shared/stat'
import { categoryBreakdown, dailyAverage, expensesInMonth, monthOverMonthChange, plannedSpend, projectedMonthEnd, weeklyAverage } from '@/lib/budget'
import { money } from '@/lib/format'
import type { Expense, Item } from '@/lib/types'

export function BudgetOverview({
  today,
  budget,
  onEditBudget,
  spent,
  expenses,
  items,
  onExpense,
  primaryAction,
}: {
  /** The real date (`YYYY-MM-DD`); "this month" is the calendar month it falls in. */
  today: string
  budget: number
  /** Opens the profile, where the monthly limit is actually edited. */
  onEditBudget: () => void
  spent: number
  /** Every expense of the household — this month's are picked here, and the previous month's are
   *  needed for the comparison. */
  expenses: Expense[]
  items: Item[]
  onExpense: () => void
  /** Rendered right under the heading, above the numbers — the receipt upload, the tab's most
   *  frequent action, which used to sit far below the charts. */
  primaryAction?: ReactNode
}) {
  const breakdown = categoryBreakdown(expensesInMonth(expenses, today))
  const maxCategoryTotal = Math.max(...breakdown.map((entry) => entry.total), 1)
  const comparison = monthOverMonthChange(expenses, today)
  const planned = plannedSpend(items)

  const remaining = budget - spent

  return (
    <div className="space-y-5 lg:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Tento měsíc</p>
          <h2 className="mt-0.5 text-2xl font-semibold tracking-tight">Rozpočet domácnosti</h2>
        </div>
        <button onClick={onExpense} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Plus className="h-4 w-4" aria-hidden="true" /> Přidat výdaj
        </button>
      </div>
      {primaryAction}
      <BudgetHero budget={budget} spent={spent} remaining={remaining} onSetBudget={onEditBudget} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat label="Denní průměr" value={money(dailyAverage(expenses, today))} icon={<CalendarClock />} />
        <Stat label="Týdenní průměr" value={money(weeklyAverage(expenses, today))} icon={<CalendarClock />} />
        <div className="col-span-2 sm:col-span-1">
          <Stat label="Očekáváno do konce měsíce" value={money(projectedMonthEnd(expenses, today))} icon={<TrendingUp />} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr] lg:gap-6">
        <div className="surface p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">Rozdělení výdajů podle kategorií</p>
            <button onClick={onEditBudget} className="min-h-10 shrink-0 rounded-lg px-2 text-xs font-medium text-primary hover:bg-primary/10">
              Upravit limit
            </button>
          </div>
          <div className="mt-5 space-y-4">
            {breakdown.map(({ category, total }) => (
              <div key={category}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words">{category}</span>
                  <span className="shrink-0 font-medium">{total.toLocaleString('cs-CZ')} Kč</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${CATEGORY_BAR_COLORS[category] ?? 'bg-primary'}`} style={{ width: `${(total / maxCategoryTotal) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {comparison && (
          <div className="rounded-3xl bg-accent p-5 text-accent-foreground sm:p-6">
            {comparison.changePercent <= 0 ? <TrendingDown className="h-5 w-5" aria-hidden="true" /> : <TrendingUp className="h-5 w-5" aria-hidden="true" />}
            <p className="mt-4 text-xl font-semibold leading-snug">
              {comparison.changePercent <= 0 ? 'Utrácíte méně' : 'Utrácíte více'} než minulý měsíc.
            </p>
            <p className="mt-2 text-sm opacity-80">
              Od začátku měsíce {money(comparison.current)} oproti {money(comparison.previous)} za stejné dny minulého měsíce (
              {comparison.changePercent > 0 ? '+' : ''}
              {comparison.changePercent.toFixed(0)} %).
            </p>
          </div>
          )}
          <div className="surface p-5">
            <p className="text-sm font-semibold">Plánované vs. skutečné výdaje</p>
            <div className="mt-4 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Plánováno (nedokončený nákup)</span>
              <span className="shrink-0 font-medium">{money(planned)}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Skutečné výdaje</span>
              <span className="shrink-0 font-medium">{money(spent)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
