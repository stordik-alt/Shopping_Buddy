import type { ReactNode } from 'react'
import { AlertTriangle, CalendarClock, Plus, TrendingDown, TrendingUp } from 'lucide-react'
import { BudgetHero } from '@/components/budget/budget-hero'
import { Panel } from '@/components/budget/panel'
import { PurchaseSavingsCard } from '@/components/budget/purchase-savings-card'
import { SpendingDonut } from '@/components/budget/spending-donut'
import { Button } from '@/components/ui/button'
import { budgetAllowances, expensesInPeriod, periodDaysLeft, periodOverPeriodChange, plannedSpend, projectedPeriodEnd, totalSpent } from '@/lib/budget'
import { isCalendarMonth, type PeriodInput } from '@/lib/budget-period'
import { countLabel, money, thisPeriodTitle, wholeMoney } from '@/lib/format'
import type { Expense, Item, PurchaseRecord } from '@/lib/types'

export function BudgetOverview({
  today,
  period = 1,
  budget,
  onEditBudget,
  expenses,
  items,
  purchases,
  onExpense,
  onCategoryClick,
  primaryAction,
}: {
  /** The real date (`YYYY-MM-DD`) in the application's timezone. */
  today: string
  /** The household's currently running budget cycle. */
  period?: PeriodInput
  budget: number
  onEditBudget: () => void
  /** The household's real expense records; all visible totals are derived from this source. */
  expenses: Expense[]
  items: Item[]
  purchases: PurchaseRecord[]
  onExpense: () => void
  onCategoryClick: (category: Expense['category']) => void
  /** Optional action shown after the key financial figures. */
  primaryAction?: ReactNode
}) {
  const periodExpenses = expensesInPeriod(expenses, today, period)
  const spent = totalSpent(periodExpenses)
  const comparison = periodOverPeriodChange(expenses, today, period)
  const planned = plannedSpend(items)
  const projected = projectedPeriodEnd(expenses, today, period)
  const calendar = isCalendarMonth(period)
  const periodNoun = calendar ? 'měsíce' : 'období'
  const daysLeft = periodDaysLeft(today, period)
  const allowances = budgetAllowances(budget, spent, daysLeft)

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

      <div className="grid min-w-0 gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(15rem,0.8fr)]">
        <BudgetHero budget={budget} spent={spent} remaining={budget - spent} onSetBudget={onEditBudget} />
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-1">
          <AllowanceCard kind="day" daysLeft={daysLeft} allowances={allowances} onEditBudget={onEditBudget} />
          <AllowanceCard kind="week" daysLeft={daysLeft} allowances={allowances} onEditBudget={onEditBudget} />
        </div>
      </div>

      {primaryAction}

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2 lg:gap-6">
        <SpendingDonut expenses={expenses} today={today} period={period} onCategoryClick={onCategoryClick} />
        <PurchaseSavingsCard today={today} purchases={purchases} />
      </div>

      <Panel title="Srovnání a očekávání" summary={`Do konce ${periodNoun} přibližně ${wholeMoney(projected)}`}>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {comparison && (
              <div className="rounded-2xl bg-accent-subtle p-4 sm:p-5">
                {comparison.changePercent <= 0 ? <TrendingDown className="size-5 text-accent-text" aria-hidden="true" /> : <TrendingUp className="size-5 text-accent-text" aria-hidden="true" />}
                <p className="mt-3 text-base font-semibold leading-snug">
                  {comparison.changePercent <= 0 ? 'Utrácíte méně' : 'Utrácíte více'} než {calendar ? 'minulý měsíc' : 'v minulém období'}.
                </p>
                <p className="mt-2 text-sm text-fg-secondary">
                  Od začátku {periodNoun} {money(comparison.current)} oproti {money(comparison.previous)} za stejné dny {calendar ? 'minulého měsíce' : 'minulého období'} (
                  {comparison.changePercent > 0 ? '+' : ''}{comparison.changePercent.toFixed(0)} %).
                </p>
              </div>
            )}
            <StatProjection projected={projected} budget={budget} periodNoun={periodNoun} />
          </div>
          <div className="rounded-2xl bg-muted p-4 sm:p-5">
            <p className="text-sm font-semibold">Plánované vs. skutečné výdaje</p>
            <div className="mt-3 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-fg-secondary">Plánováno (nedokončený nákup)</span>
              <span className="shrink-0 font-medium">{money(planned)}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-fg-secondary">Skutečné výdaje</span>
              <span className="shrink-0 font-medium">{money(spent)}</span>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function AllowanceCard({
  kind,
  daysLeft,
  allowances,
  onEditBudget,
}: {
  kind: 'day' | 'week'
  daysLeft: number
  allowances: ReturnType<typeof budgetAllowances>
  onEditBudget: () => void
}) {
  const title = kind === 'day' ? 'Doporučená útrata na den' : 'Doporučená útrata na týden'
  const Icon = CalendarClock
  const amount = allowances.status === 'available'
    ? kind === 'day' ? allowances.perDay : allowances.perWeek
    : null

  return (
    <section className="surface flex min-w-0 flex-col p-3.5 sm:p-5" aria-label={title}>
      <p className="flex min-h-10 items-start gap-1.5 text-xs font-medium leading-snug text-fg-secondary sm:text-sm">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{title}</span>
      </p>
      {allowances.status === 'available' ? (
        <>
          <p className="mt-2 break-words text-xl font-semibold tracking-tight sm:text-2xl">{wholeMoney(amount!)}</p>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            Orientačně {kind === 'day' ? 'na den' : `na ${countLabel(Math.min(7, daysLeft), 'den', 'dny', 'dní')}`}; dnešek se počítá.
          </p>
        </>
      ) : allowances.status === 'overspent' ? (
        <>
          <p className="mt-2 break-words text-base font-semibold leading-snug text-destructive sm:text-lg">Překročeno o {money(allowances.overrun)}</p>
          <p className="mt-1 text-xs leading-relaxed text-fg-secondary">Teď je potřeba omezit výdaje; kladná útrata se nedoporučuje.</p>
        </>
      ) : allowances.status === 'exhausted' ? (
        <>
          <p className="mt-2 text-base font-semibold leading-snug sm:text-lg">Rozpočet je vyčerpán</p>
          <p className="mt-1 text-xs leading-relaxed text-fg-secondary">Další výdaje by znamenaly překročení limitu.</p>
        </>
      ) : allowances.status === 'missing-budget' ? (
        <>
          <p className="mt-2 text-sm font-semibold leading-snug">Chybí rozpočtový limit</p>
          <button type="button" onClick={onEditBudget} className="mt-1 w-fit rounded-md text-xs font-medium text-accent-text underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Nastavit limit</button>
        </>
      ) : (
        <p className="mt-2 text-sm font-semibold leading-snug">Rozpočtové období skončilo</p>
      )}
    </section>
  )
}

function StatProjection({ projected, budget, periodNoun }: { projected: number; budget: number; periodNoun: string }) {
  return (
    <div className="rounded-2xl bg-muted p-4 sm:p-5">
      <p className="text-sm font-semibold">Očekáváno do konce {periodNoun}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{wholeMoney(projected)}</p>
      <p className="mt-1 text-sm text-fg-secondary">Podle dosavadního běžného tempa výdajů.</p>
      {projectionHint(projected, budget)}
    </div>
  )
}

/** Month-end projection against the limit, in words and with an icon — never colour alone. */
function projectionHint(projected: number, budget: number): ReactNode {
  if (budget <= 0) return null
  const difference = projected - budget
  if (difference > 0) {
    return (
      <span className="mt-2 flex items-center gap-1 font-medium text-destructive">
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" /> o {wholeMoney(difference)} nad limitem
      </span>
    )
  }
  return <span className="mt-2 block text-sm text-fg-secondary">V limitu, rezerva {wholeMoney(-difference)}</span>
}
