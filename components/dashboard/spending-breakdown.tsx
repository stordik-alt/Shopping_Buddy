import { categoryBreakdown } from '@/lib/budget'
import type { ExpenseCategory } from '@/lib/expense-categories'
import type { Expense } from '@/lib/types'

// One chart token per category so the same category is the same colour on the dashboard and in
// the Rozpočet tab (budget-overview.tsx reads the same map).
export const CATEGORY_BAR_COLORS: Record<ExpenseCategory, string> = {
  Potraviny: 'bg-chart-1',
  Drogerie: 'bg-chart-4',
  Děti: 'bg-chart-3',
  Domácnost: 'bg-chart-2',
  Ostatní: 'bg-chart-5',
  Bydlení: 'bg-chart-6',
  Auto: 'bg-chart-7',
  'Oblečení a obuv': 'bg-chart-8',
  Zdraví: 'bg-chart-9',
  'Volný čas': 'bg-chart-10',
}

/** This month's real spending per category, straight from the household's expenses (replaces the
 *  earlier decorative chart that showed made-up numbers). */
export function SpendingBreakdown({ expenses, onDetails }: { expenses: Expense[]; onDetails: () => void }) {
  const breakdown = categoryBreakdown(expenses)
  const max = Math.max(...breakdown.map((entry) => entry.total), 1)

  return (
    <section className="surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Výdaje podle kategorií</p>
          <p className="mt-1 text-xs text-muted-foreground">Tento měsíc</p>
        </div>
        <button onClick={onDetails} className="min-h-10 shrink-0 rounded-lg px-2 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Podrobnosti
        </button>
      </div>
      {breakdown.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">Zatím nemáte žádné výdaje. Zapište první výdaj a uvidíte přehled.</p>
      ) : (
        <ul className="mt-5 space-y-4">
          {breakdown.map(({ category, total }) => (
            <li key={category}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 break-words">{category}</span>
                {/* Same format as the Rozpočet tab's breakdown, so one total never reads two ways. */}
                <span className="shrink-0 font-medium">{total.toLocaleString('cs-CZ')} Kč</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${CATEGORY_BAR_COLORS[category] ?? 'bg-primary'}`} style={{ width: `${(total / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
