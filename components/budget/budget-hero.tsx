import { AlertTriangle, CalendarDays } from 'lucide-react'
import { BUDGET_WARNING_RATIO, budgetLevel, budgetPace } from '@/lib/budget'
import { countLabel, wholeMoney } from '@/lib/format'

/** The household's budget at a glance: what is left, how much of the limit is used and — from
 *  80 % — a visible warning. Shared by the dashboard and the Rozpočet tab so both always agree.
 *  The 80 % / 100 % boundaries come from `lib/budget.ts` (same ones the notifications use). */
export function BudgetHero({
  budget,
  spent,
  remaining,
  onSetBudget,
  compact = false,
  className = '',
  today,
}: {
  budget: number
  spent: number
  remaining: number
  /** Opens wherever the monthly limit is edited; offered when no budget is set yet. */
  onSetBudget?: () => void
  /** A shorter card for the home screen, so the shopping list and deals fit on a phone's first
   *  screen; the Rozpočet tab keeps the large one. Same numbers and warnings either way. */
  compact?: boolean
  className?: string
  /** The real date (`YYYY-MM-DD`). When given, the card also says how much is left per day and,
   *  once the month has enough history, whether the current pace would break the limit. */
  today?: string
}) {
  // Display-only: clamped so an overspent month does not draw outside its track.
  const spentPercent = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0
  const level = budgetLevel(spent, budget)
  const pace = today ? budgetPace(spent, budget, today) : null

  // A brand-new household has no limit yet. "0 Kč left, 0 %" would read as a real (and alarming)
  // result, so say plainly that nothing is set and offer the way to set it.
  if (budget <= 0) {
    return (
      <div className={`flex flex-col justify-between gap-6 rounded-3xl bg-primary p-5 text-primary-foreground shadow-[var(--shadow-card)] sm:p-7 ${className}`}>
        <div>
          <p className="text-sm text-primary-foreground/75">Rozpočet domácnosti</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Nastavte si měsíční limit</p>
          <p className="mt-2 text-sm text-primary-foreground/80">
            Pak uvidíte, kolik vám zbývá{spent > 0 ? ` (zatím utraceno ${spent.toLocaleString('cs-CZ')} Kč)` : ''}, a upozorníme vás při 80 % i 100 %.
          </p>
        </div>
        {onSetBudget && (
          <button
            onClick={onSetBudget}
            className="flex min-h-11 w-fit items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Nastavit rozpočet
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col justify-between rounded-3xl bg-primary text-primary-foreground shadow-[var(--shadow-card)] ${compact ? 'px-5 py-4' : 'gap-6 p-5 sm:p-7'} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-primary-foreground/75">{level === 'over' ? 'Rozpočet překročen o' : 'Zbývá v rozpočtu'}</p>
        {level !== 'ok' && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {level === 'over' ? 'Limit překročen' : 'Přes 80 % limitu'}
          </span>
        )}
      </div>
      <p className={`font-semibold tracking-tight break-words ${compact ? 'mt-1 text-3xl' : 'mt-2 text-4xl sm:text-5xl'}`}>{Math.abs(remaining).toLocaleString('cs-CZ')} Kč</p>
      <div
        className={`relative overflow-hidden rounded-full bg-primary-foreground/20 ${compact ? 'mt-3 h-2' : 'mt-6 h-2.5'}`}
        role="progressbar"
        aria-label="Čerpání rozpočtu"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={spentPercent}
      >
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${spentPercent}%` }} />
        {/* The 80 % warning boundary (lib/budget.ts), so the household sees it coming, not only
            once the warning chip appears. A 2px notch in the card colour reads on either fill. */}
        <div className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${BUDGET_WARNING_RATIO * 100}%` }} aria-hidden="true" />
      </div>
      <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-primary-foreground/80 ${compact ? 'mt-2 text-xs' : 'mt-3 text-sm'}`}>
        <span>
          Utraceno <span className="font-semibold text-primary-foreground">{spent.toLocaleString('cs-CZ')} Kč</span> z {budget.toLocaleString('cs-CZ')} Kč
        </span>
        <span className="font-semibold text-primary-foreground">{spentPercent} %</span>
      </div>
      {pace && level !== 'over' && (
        <div className={`flex flex-col gap-1 border-t border-primary-foreground/15 text-primary-foreground/85 ${compact ? 'mt-3 pt-3 text-xs' : 'mt-5 pt-4 text-sm'}`}>
          <p className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Na den zbývá <span className="font-semibold text-primary-foreground">{wholeMoney(pace.perDayLeft)}</span>
              {pace.daysLeft > 1 ? ` (${countLabel(pace.daysLeft, 'den', 'dny', 'dní')} do konce měsíce)` : ' (poslední den měsíce)'}
            </span>
          </p>
          {pace.projectedOver != null && (
            <p className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Při tomto tempu překročíte limit o <span className="font-semibold text-primary-foreground">{wholeMoney(pace.projectedOver)}</span>
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
