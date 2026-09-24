import { AlertTriangle } from 'lucide-react'
import { budgetLevel } from '@/lib/budget'

/** The household's budget at a glance: what is left, how much of the limit is used and — from
 *  80 % — a visible warning. Shared by the dashboard and the Rozpočet tab so both always agree.
 *  The 80 % / 100 % boundaries come from `lib/budget.ts` (same ones the notifications use). */
export function BudgetHero({
  budget,
  spent,
  remaining,
  onSetBudget,
  className = '',
}: {
  budget: number
  spent: number
  remaining: number
  /** Opens wherever the monthly limit is edited; offered when no budget is set yet. */
  onSetBudget?: () => void
  className?: string
}) {
  // Display-only: clamped so an overspent month does not draw outside its track.
  const spentPercent = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0
  const level = budgetLevel(spent, budget)

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
    <div className={`flex flex-col justify-between gap-6 rounded-3xl bg-primary p-5 text-primary-foreground shadow-[var(--shadow-card)] sm:p-7 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-primary-foreground/75">{level === 'over' ? 'Rozpočet překročen o' : 'Zbývá v rozpočtu'}</p>
        {level !== 'ok' && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {level === 'over' ? 'Limit překročen' : 'Přes 80 % limitu'}
          </span>
        )}
      </div>
      <p className="mt-2 text-4xl font-semibold tracking-tight break-words sm:text-5xl">{Math.abs(remaining).toLocaleString('cs-CZ')} Kč</p>
      <div
        className="mt-6 h-2.5 overflow-hidden rounded-full bg-primary-foreground/20"
        role="progressbar"
        aria-label="Čerpání rozpočtu"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={spentPercent}
      >
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${spentPercent}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-primary-foreground/80">
        <span>
          Utraceno <span className="font-semibold text-primary-foreground">{spent.toLocaleString('cs-CZ')} Kč</span> z {budget.toLocaleString('cs-CZ')} Kč
        </span>
        <span className="font-semibold text-primary-foreground">{spentPercent} %</span>
      </div>
    </div>
  )
}
