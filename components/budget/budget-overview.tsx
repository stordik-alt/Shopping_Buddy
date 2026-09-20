import { CalendarClock, CircleDollarSign, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Stat } from '@/components/shared/stat'
import { categoryBreakdown, dailyAverage, monthOverMonthChange, plannedSpend, projectedMonthEnd, weeklyAverage } from '@/lib/budget'
import { money } from '@/lib/format'
import type { Expense, Item } from '@/lib/types'

const CATEGORY_COLORS: Record<string, string> = {
  Potraviny: 'bg-primary',
  Drogerie: 'bg-[#b9d8f5]',
  Děti: 'bg-[#d7f36b]',
  Domácnost: 'bg-[#9ed9c5]',
  Ostatní: 'bg-[#d7dde3]',
}

export function BudgetOverview({
  budget,
  setBudget,
  spent,
  expenses,
  items,
  onExpense,
}: {
  budget: number
  setBudget: (v: number) => void
  spent: number
  expenses: Expense[]
  items: Item[]
  onExpense: () => void
}) {
  const breakdown = categoryBreakdown(expenses)
  const maxCategoryTotal = Math.max(...breakdown.map((entry) => entry.total), 1)
  const comparison = monthOverMonthChange(expenses)
  const planned = plannedSpend(items)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Září 2026</p>
          <h2 className="mt-1 text-2xl font-semibold">Rozpočet domácnosti</h2>
        </div>
        <button onClick={onExpense} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
          + Přidat výdaj
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Celkem" value={`${budget.toLocaleString('cs-CZ')} Kč`} icon={<Wallet />} />
        <Stat label="Utraceno" value={`${spent.toLocaleString('cs-CZ')} Kč`} icon={<TrendingDown />} />
        <Stat label="Zbývá" value={`${(budget - spent).toLocaleString('cs-CZ')} Kč`} icon={<CircleDollarSign />} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Denní průměr" value={money(dailyAverage(expenses))} icon={<CalendarClock />} />
        <Stat label="Týdenní průměr" value={money(weeklyAverage(expenses))} icon={<CalendarClock />} />
        <Stat label="Očekáváno do konce měsíce" value={money(projectedMonthEnd(expenses))} icon={<TrendingUp />} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-3xl border border-border bg-card p-6">
          <div className="flex justify-between">
            <p className="font-semibold">Rozdělení výdajů podle kategorií</p>
            <button onClick={() => setBudget(budget === 12000 ? 14000 : 12000)} className="text-xs text-primary">
              Upravit limit
            </button>
          </div>
          <div className="mt-6 space-y-5">
            {breakdown.map(({ category, total }) => (
              <div key={category}>
                <div className="mb-2 flex justify-between text-sm">
                  <span>{category}</span>
                  <span className="font-medium">{total.toLocaleString('cs-CZ')} Kč</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className={`h-full rounded-full ${CATEGORY_COLORS[category] ?? 'bg-primary'}`} style={{ width: `${(total / maxCategoryTotal) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-3xl bg-[#f4b183] p-6 text-[#5b321f]">
            {comparison.changePercent <= 0 ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
            <p className="mt-6 text-2xl font-semibold">
              {comparison.changePercent <= 0 ? 'Utrácíte méně' : 'Utrácíte více'} než minulý měsíc.
            </p>
            <p className="mt-3 text-sm opacity-70">
              Tento měsíc {money(comparison.current)} oproti {money(comparison.previous)} minulý měsíc (
              {comparison.changePercent > 0 ? '+' : ''}
              {comparison.changePercent.toFixed(0)} %).
            </p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-5">
            <p className="text-sm font-semibold">Plánované vs. skutečné výdaje</p>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Plánováno (nedokončený nákup)</span>
              <span className="font-medium">{money(planned)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Skutečné výdaje</span>
              <span className="font-medium">{money(spent)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
