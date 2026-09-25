import { PiggyBank } from 'lucide-react'
import { daysInMonth, weeklyAllowance } from '@/lib/budget'
import { countLabel } from '@/lib/format'

/** How much the household can spend this week and still cover the rest of the month — the remaining
 *  budget spread over the weeks that are left (lib/budget.ts `weeklyAllowance`). It used to divide
 *  by a fixed 2.3 weeks whatever the date, and pointed to the not-yet-offered AI assistant. */
export function SavingsInsight({ remaining, today }: { remaining: number; today: string }) {
  // With no budget set or nothing left, "you can spend about 0 Kč" is noise, not a recommendation.
  if (remaining <= 0) return null
  const weekly = Math.round(weeklyAllowance(remaining, today))
  const daysLeft = daysInMonth(today) - Number(today.slice(8, 10)) + 1
  return (
    <section className="surface self-start p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
          <PiggyBank aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Kolik můžete utratit tento týden</p>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Přibližně <span className="font-semibold text-foreground">{weekly.toLocaleString('cs-CZ')} Kč</span>, aby rozpočet vystačil do
            konce měsíce (zbývá {countLabel(daysLeft, 'den', 'dny', 'dní')}).
          </p>
        </div>
      </div>
    </section>
  )
}
