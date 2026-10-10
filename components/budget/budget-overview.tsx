import type { ReactNode } from 'react'
import { AlertTriangle, CalendarClock, Plus, TrendingDown, TrendingUp } from 'lucide-react'
import { BudgetHero } from '@/components/budget/budget-hero'
import { Panel } from '@/components/budget/panel'
import { Stat } from '@/components/shared/stat'
import { Button } from '@/components/ui/button'
import { dailyAverage, periodOverPeriodChange, plannedSpend, projectedPeriodEnd, weeklyAverage } from '@/lib/budget'
import { isCalendarMonth, type PeriodInput } from '@/lib/budget-period'
import { money, thisPeriodTitle, wholeMoney } from '@/lib/format'
import type { Expense, Item } from '@/lib/types'

export function BudgetOverview({
  today,
  period = 1,
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
  /** The household's budget period (1 or the calendar kind = calendar month). */
  period?: PeriodInput
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
  const comparison = periodOverPeriodChange(expenses, today, period)
  const planned = plannedSpend(items)
  const calendar = isCalendarMonth(period)
  const periodNoun = calendar ? 'měsíce' : 'období'

  const remaining = budget - spent

  return (
    <div className="space-y-5 lg:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-fg-muted">{thisPeriodTitle(today, period)}</p>
          <h2 className="mt-0.5 text-2xl font-semibold tracking-tight">Rozpočet domácnosti</h2>
        </div>
        <Button size="lg" onClick={onExpense}>
          <Plus aria-hidden="true" /> Přidat výdaj
        </Button>
      </div>
      {primaryAction}
      {/* The compact card, as on Domů: the full-size one filled most of a phone screen (owner, 2026-10-05). */}
      <BudgetHero compact today={today} period={period} budget={budget} spent={spent} remaining={remaining} onSetBudget={onEditBudget} />
      {/* The hero already says where the period is heading; the averages, the comparison and planned vs.
          actual are detail, so on a phone they sit in one collapsed block instead of three more cards. */}
      <Panel title="Průměry a srovnání" summary={`Denně ${wholeMoney(dailyAverage(expenses, today, period))} · týdně ${wholeMoney(weeklyAverage(expenses, today, period))}`}>
      <div className="space-y-5 lg:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat label="Denní průměr" value={wholeMoney(dailyAverage(expenses, today, period))} icon={<CalendarClock />} />
        <Stat label="Týdenní průměr" value={wholeMoney(weeklyAverage(expenses, today, period))} icon={<CalendarClock />} />
        <div className="col-span-2 sm:col-span-1">
          <Stat
            label={`Očekáváno do konce ${periodNoun}`}
            value={wholeMoney(projectedPeriodEnd(expenses, today, period))}
            icon={<TrendingUp />}
            hint={projectionHint(projectedPeriodEnd(expenses, today, period), budget)}
          />
        </div>
      </div>
      {/* The breakdown by category and subcategory, month by month, is the expense overview below
          (components/budget/expense-ledger.tsx). */}
      <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
        {comparison && (
        <div className="rounded-2xl bg-accent-subtle p-5 sm:p-6">
          {comparison.changePercent <= 0 ? <TrendingDown className="size-5 text-accent-text" aria-hidden="true" /> : <TrendingUp className="size-5 text-accent-text" aria-hidden="true" />}
          <p className="mt-4 text-lg font-semibold leading-snug">
            {comparison.changePercent <= 0 ? 'Utrácíte méně' : 'Utrácíte více'} než {calendar ? 'minulý měsíc' : 'v minulém období'}.
          </p>
          <p className="mt-2 text-sm text-fg-secondary">
            Od začátku {periodNoun} {money(comparison.current)} oproti {money(comparison.previous)} za stejné dny {calendar ? 'minulého měsíce' : 'minulého období'} (
            {comparison.changePercent > 0 ? '+' : ''}
            {comparison.changePercent.toFixed(0)} %).
          </p>
        </div>
        )}
        <div className="surface p-5">
          <p className="text-sm font-semibold">Plánované vs. skutečné výdaje</p>
          <div className="mt-4 flex items-baseline justify-between gap-3 text-sm">
            <span className="text-fg-secondary">Plánováno (nedokončený nákup)</span>
            <span className="shrink-0 font-medium">{money(planned)}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
            <span className="text-fg-secondary">Skutečné výdaje</span>
            <span className="shrink-0 font-medium">{money(spent)}</span>
          </div>
        </div>
      </div>
      </div>
      </Panel>
    </div>
  )
}

/** The month-end projection set against the limit, in words and with an icon — never colour alone. */
function projectionHint(projected: number, budget: number): ReactNode {
  if (budget <= 0) return null
  const difference = projected - budget
  if (difference > 0) {
    return (
      <span className="flex items-center gap-1 font-medium text-destructive">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> o {wholeMoney(difference)} nad limitem
      </span>
    )
  }
  return <span>v limitu, rezerva {wholeMoney(-difference)}</span>
}
