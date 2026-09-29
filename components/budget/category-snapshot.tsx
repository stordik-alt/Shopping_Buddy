import { CATEGORY_BAR_COLORS } from '@/components/dashboard/spending-breakdown'
import { categoryRows, expensePeriod, periodSummary } from '@/lib/budget'
import { money, thisPeriodTitle } from '@/lib/format'
import type { CategoryBudgets, Expense } from '@/lib/types'

/** This month's spending by category, at a glance — budgeted vs. spent vs. remaining, no drill-down
 *  or editing (that lives in Výdaje/ExpenseLedger). Belongs on "Aktuální stav": the household should
 *  see where it stands without opening anything. Nothing calculated here; lib/budget.ts owns the
 *  numbers, same as ExpenseLedger. */
export function CategorySnapshot({ expenses, today, limits, periodStartDay = 1 }: { expenses: Expense[]; today: string; limits: CategoryBudgets; periodStartDay?: number }) {
  const rows = categoryRows(periodSummary(expenses, expensePeriod(today, periodStartDay), periodStartDay), limits)
  if (rows.length === 0) return null

  return (
    <section className="surface p-5 sm:p-6" aria-label="Výdaje podle kategorií v aktuálním období">
      <p className="text-sm font-semibold">Podle kategorií</p>
      <p className="mt-1 text-sm text-muted-foreground">{thisPeriodTitle(today, periodStartDay)}, na první pohled.</p>
      <div className="mt-4 space-y-2">
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
    </section>
  )
}
