import { AlertTriangle, CalendarDays, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { BUDGET_WARNING_RATIO, budgetLevel, budgetPace } from '@/lib/budget'
import { countLabel, wholeMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

const FILL = { ok: 'bg-accent-solid', warning: 'bg-warning', over: 'bg-destructive' } as const

/** The household's budget at a glance: what is left, how much of the limit is used and — from
 *  80 % — a visible warning. Shared by the dashboard and the Rozpočet tab so both always agree.
 *  The 80 % / 100 % boundaries come from `lib/budget.ts` (same ones the notifications use). */
export function BudgetHero({
  budget,
  spent,
  remaining,
  onSetBudget,
  onOpen,
  compact = false,
  className = '',
  today,
  periodStartDay = 1,
}: {
  budget: number
  spent: number
  remaining: number
  /** Opens wherever the monthly limit is edited; offered when no budget is set yet. */
  onSetBudget?: () => void
  /** Makes the whole card one tap target leading to the budget detail (the dashboard). */
  onOpen?: () => void
  /** A shorter card for the home screen, so the shopping list and deals fit on a phone's first
   *  screen; the Rozpočet tab keeps the large one. Same numbers and warnings either way. */
  compact?: boolean
  className?: string
  /** The real date (`YYYY-MM-DD`). When given, the card also says how much is left per day and,
   *  once the month has enough history, whether the current pace would break the limit. */
  today?: string
  /** Day of the month the budget period starts on (1 = calendar month). */
  periodStartDay?: number
}) {
  // Display-only: clamped so an overspent month does not draw outside its track.
  const spentPercent = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0
  const level = budgetLevel(spent, budget)
  const pace = today ? budgetPace(spent, budget, today, periodStartDay) : null
  const periodNoun = periodStartDay === 1 ? 'měsíce' : 'období'
  const surface = 'rounded-3xl bg-hero text-hero-foreground shadow-[var(--shadow-card)]'

  // A brand-new household has no limit yet. "0 Kč left, 0 %" would read as a real (and alarming)
  // result, so say plainly that nothing is set and offer the way to set it.
  if (budget <= 0) {
    return (
      <div className={cn('flex flex-col justify-between gap-5 p-5 sm:p-7', surface, className)}>
        <div>
          <p className="text-sm text-hero-foreground/75">Rozpočet domácnosti</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Nastavte si měsíční limit</p>
          <p className="mt-2 text-sm text-hero-foreground/80">
            Pak uvidíte, kolik vám zbývá{spent > 0 ? ` (zatím utraceno ${spent.toLocaleString('cs-CZ')} Kč)` : ''}, a upozorníme vás při 80 % i 100 %.
          </p>
        </div>
        {onSetBudget && (
          <button
            type="button"
            onClick={onSetBudget}
            className="flex min-h-11 w-fit items-center rounded-xl bg-accent-solid px-4 text-sm font-semibold text-accent-solid-foreground transition hover:bg-accent-solid-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-hero"
          >
            Nastavit rozpočet
          </button>
        )}
      </div>
    )
  }

  const Root = onOpen ? 'button' : 'div'
  return (
    <Root
      {...(onOpen ? { type: 'button' as const, onClick: onOpen } : {})}
      className={cn(
        'min-w-0 w-full flex flex-col justify-between text-left',
        surface,
        compact ? 'px-5 py-4' : 'gap-6 p-5 sm:p-7',
        onOpen && 'group transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <span className="flex w-full items-start justify-between gap-3">
        <span className="text-sm text-hero-foreground/75">{level === 'over' ? 'Rozpočet překročen o' : 'Zbývá v rozpočtu'}</span>
        <span className="flex shrink-0 items-center gap-1">
          {level !== 'ok' && (
            <Badge tone={level === 'over' ? 'danger' : 'warning'}>
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              {level === 'over' ? 'Limit překročen' : 'Přes 80 % limitu'}
            </Badge>
          )}
          {onOpen && <ChevronRight className="size-5 text-hero-foreground/70 transition group-hover:translate-x-0.5" aria-hidden="true" />}
        </span>
      </span>
      {/* Spans only: when `onOpen` is set this is inside a <button>, which allows phrasing content only. */}
      <span className={cn('block font-semibold tracking-tight break-words', compact ? 'mt-1 text-3xl' : 'mt-2 text-4xl sm:text-5xl')}>{Math.abs(remaining).toLocaleString('cs-CZ')} Kč</span>
      <span
        className={cn('relative block w-full overflow-hidden rounded-full bg-hero-foreground/20', compact ? 'mt-3 h-2' : 'mt-6 h-2.5')}
        role="progressbar"
        aria-label="Čerpání rozpočtu"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={spentPercent}
      >
        <span className={cn('block h-full rounded-full transition-[width]', FILL[level])} style={{ width: `${spentPercent}%` }} />
        {/* The 80 % warning boundary (lib/budget.ts), so the household sees it coming, not only
            once the warning chip appears. A 2px notch in the card colour reads on either fill. */}
        <span className="absolute inset-y-0 w-0.5 bg-hero" style={{ left: `${BUDGET_WARNING_RATIO * 100}%` }} aria-hidden="true" />
      </span>
      <span className={cn('flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-hero-foreground/80', compact ? 'mt-2 text-xs' : 'mt-3 text-sm')}>
        <span>
          Utraceno <span className="font-semibold text-hero-foreground">{spent.toLocaleString('cs-CZ')} Kč</span> z {budget.toLocaleString('cs-CZ')} Kč
        </span>
        <span className="font-semibold text-hero-foreground">{spentPercent} %</span>
      </span>
      {pace && level !== 'over' && (
        <span className={cn('flex w-full flex-col gap-1 border-t border-hero-foreground/15 text-hero-foreground/85', compact ? 'mt-3 pt-3 text-xs' : 'mt-5 pt-4 text-sm')}>
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
            <span>
              Na den zbývá <span className="font-semibold text-hero-foreground">{wholeMoney(pace.perDayLeft)}</span>
              {pace.daysLeft > 1 ? ` (${countLabel(pace.daysLeft, 'den', 'dny', 'dní')} do konce ${periodNoun})` : ` (poslední den ${periodNoun})`}
            </span>
          </span>
          {pace.projectedOver != null && (
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
              <span>
                Při tomto tempu překročíte limit o <span className="font-semibold text-hero-foreground">{wholeMoney(pace.projectedOver)}</span>
              </span>
            </span>
          )}
        </span>
      )}
    </Root>
  )
}
