import {
  Baby,
  Bus,
  Building2,
  Car,
  Heart,
  House,
  Shirt,
  ShoppingBasket,
  ShoppingBag,
  Sparkles,
  Ticket,
  type LucideIcon,
} from 'lucide-react'
import { CATEGORY_CHART_COLORS } from '@/components/dashboard/spending-breakdown'
import { categoryBreakdown, expensesInPeriod, totalSpent } from '@/lib/budget'
import { spendingDonutSegments } from '@/lib/budget-chart'
import type { PeriodInput } from '@/lib/budget-period'
import { money, thisPeriodTitle } from '@/lib/format'
import type { Expense } from '@/lib/types'

const CATEGORY_ICONS: Record<Expense['category'], LucideIcon> = {
  Potraviny: ShoppingBasket,
  Drogerie: Sparkles,
  Domácnost: House,
  Bydlení: Building2,
  Auto: Car,
  Doprava: Bus,
  'Oblečení a obuv': Shirt,
  Děti: Baby,
  Zdraví: Heart,
  'Volný čas': Ticket,
  Ostatní: ShoppingBag,
}

const CIRCUMFERENCE = 2 * Math.PI * 43

export function SpendingDonut({
  expenses,
  today,
  period = 1,
  onCategoryClick,
}: {
  expenses: Expense[]
  today: string
  period?: PeriodInput
  onCategoryClick: (category: Expense['category']) => void
}) {
  const currentExpenses = expensesInPeriod(expenses, today, period)
  const categories = categoryBreakdown(currentExpenses).filter((row) => row.total > 0)
  const total = totalSpent(currentExpenses)
  const periodTitle = thisPeriodTitle(today, period)
  const segments = spendingDonutSegments(categories)

  return (
    <section className="surface min-w-0 p-5 sm:p-6" aria-labelledby="spending-donut-title">
      <div>
        <h3 id="spending-donut-title" className="text-base font-semibold">Výdaje podle kategorií</h3>
        <p className="mt-1 text-sm text-fg-muted">{periodTitle}</p>
      </div>

      {total <= 0 ? (
        <p className="mt-5 rounded-2xl bg-muted px-4 py-5 text-center text-sm text-fg-secondary">
          V tomto období zatím nejsou žádné výdaje.
        </p>
      ) : (
        <div className="mt-5 grid min-w-0 items-center gap-5 md:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.2fr)] md:gap-4">
          <div className="mx-auto w-full max-w-64">
            <div
              role="img"
              aria-label={`Prstencový graf skutečných výdajů za ${periodTitle}. Celkem ${money(total)}. ${categories.map((row) => `${row.category}: ${money(row.total)}, ${Math.round(row.total / total * 100)} procent`).join('. ')}.`}
              className="relative aspect-square w-full"
            >
              <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true" focusable="false">
                <defs>
                  <pattern id="budget-donut-other" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                    <rect width="5" height="5" fill="var(--muted)" />
                    <rect width="2" height="5" fill="var(--fg-muted)" />
                  </pattern>
                </defs>
                <circle cx="60" cy="60" r="43" fill="none" stroke="var(--muted)" strokeWidth="15" />
                {segments.map((segment, index) => {
                  const length = CIRCUMFERENCE * segment.total / total
                  const gap = Math.min(1.5, length / 4)
                  const stroke = segment.kind === 'category' ? CATEGORY_CHART_COLORS[segment.category] : 'url(#budget-donut-other)'
                  const offset = segments.slice(0, index).reduce((sum, previous) => sum + CIRCUMFERENCE * previous.total / total, 0)
                  const title = segment.kind === 'category'
                    ? `${segment.category}: ${money(segment.total)}`
                    : `Další: ${segment.categories.map((row) => row.category).join(', ')} · ${money(segment.total)}`
                  return (
                    <circle
                      key={segment.kind === 'category' ? segment.category : 'other'}
                      cx="60"
                      cy="60"
                      r="43"
                      fill="none"
                      stroke={stroke}
                      strokeWidth="15"
                      strokeDasharray={`${Math.max(0, length - gap)} ${CIRCUMFERENCE - Math.max(0, length - gap)}`}
                      strokeDashoffset={-offset}
                    >
                      <title>{title}</title>
                    </circle>
                  )
                })}
              </svg>
              <div aria-hidden="true" className="pointer-events-none absolute inset-[21%] flex flex-col items-center justify-center rounded-full bg-card px-2 text-center">
                <span className="text-xs text-fg-muted">Celkem</span>
                <span className="mt-0.5 max-w-full break-words text-base font-semibold leading-tight tracking-tight">{money(total)}</span>
              </div>
            </div>
          </div>

          <ul className="grid min-w-0 gap-1" aria-label="Legenda výdajů">
            {categories.map(({ category, total: categoryTotal }) => {
              const Icon = CATEGORY_ICONS[category]
              const share = Math.round(categoryTotal / total * 100)
              return (
                <li key={category} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onCategoryClick(category)}
                    aria-label={`${category}, ${money(categoryTotal)}, ${share} procent. Zobrazit výdaje této kategorie.`}
                    className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="size-4 shrink-0" style={{ color: CATEGORY_CHART_COLORS[category] }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 break-words text-xs font-medium leading-snug">{category}</span>
                    <span className="shrink-0 text-right text-xs tabular-nums">
                      <span className="block font-semibold">{money(categoryTotal)}</span>
                      <span className="text-fg-muted">{share} %</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
