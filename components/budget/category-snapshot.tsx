import { Panel } from '@/components/budget/panel'
import { CATEGORY_BAR_COLORS } from '@/components/dashboard/spending-breakdown'
import { categoryRows, expensePeriod, periodSummary } from '@/lib/budget'
import type { PeriodInput } from '@/lib/budget-period'
import { money, thisPeriodTitle } from '@/lib/format'
import type { CategoryBudgets, Expense } from '@/lib/types'

/** This month's spending by category, at a glance — budgeted vs. spent vs. remaining, no drill-down
 *  or editing (that lives in Výdaje/ExpenseLedger). Belongs on "Přehled": the household should
 *  see where it stands without opening anything. Nothing calculated here; lib/budget.ts owns the
 *  numbers, same as ExpenseLedger. */
export function CategorySnapshot({ expenses, today, limits, period = 1 }: { expenses: Expense[]; today: string; limits: CategoryBudgets; period?: PeriodInput }) {
  const rows = categoryRows(periodSummary(expenses, expensePeriod(today, period), period), limits)
  if (rows.length === 0) return null
  const overLimit = rows.filter((row) => row.level === 'over').length

  return (
    <Panel
      title="Podle kategorií"
      summary={overLimit > 0 ? `${overLimit}× nad limitem · ${rows.length} kategorií` : `${rows.length} ${rows.length === 1 ? 'kategorie' : rows.length < 5 ? 'kategorie' : 'kategorií'}`}
      description={`${thisPeriodTitle(today, period)}, na první pohled.`}
      defaultOpen={overLimit > 0}
    >
      <div className="space-y-2">
        {rows.map((row) => {
          const remaining = row.limit != null ? row.limit - row.total : null
          const share = row.limit != null ? Math.min(100, (row.total / row.limit) * 100) : 0
          return (
            <div key={row.category} className="rounded-2xl bg-muted px-3 py-3 sm:px-4">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 break-words font-medium">{row.category}</span>
                <span className="flex shrink-0 items-baseline gap-1 font-semibold">
                  {money(row.total)}
                  {row.limit != null && <span className="font-normal text-muted-foreground">z {money(row.limit)}</span>}
                </span>
              </div>
              {row.limit != null && (
                <>
                  <span className="mt-2 block h-2 overflow-hidden rounded-full bg-background">
                    <span className={`block h-full rounded-full ${row.level === 'over' ? 'bg-destructive' : CATEGORY_BAR_COLORS[row.category]}`} style={{ width: `${share}%` }} />
                  </span>
                  <p className={`mt-1.5 text-xs font-medium ${row.level === 'over' ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {remaining! >= 0 ? `Zbývá ${money(remaining!)}` : `Limit překročen o ${money(-remaining!)}`}
                  </p>
                </>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
