import { History, Loader2 } from 'lucide-react'
import { Panel } from '@/components/budget/panel'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { isoFromDayNumber, dayNumber } from '@/lib/budget-period'
import { money, periodLabel } from '@/lib/format'
import type { usePeriodHistory } from '@/components/shell/use-period-history'

type HistoryState = ReturnType<typeof usePeriodHistory>

/** "+1 800 Kč" / "−1 800 Kč" (docs/15 §21). */
const signedMoney = (value: number) => (value > 0 ? `+${money(value)}` : value < 0 ? `−${money(-value)}` : money(0))

/** Rozpočet → Plánování → Historie období (docs/15_BUDGET_PERIODS.md §18): the past periods as the
 *  household's own periods (a payday period is shown as such), with the real result of each. Read-only. */
export function PeriodHistory({ history, onOpenExpenses }: { history: HistoryState; /** Opens the expenses of the period starting on that date in Výdaje. */ onOpenExpenses?: (periodStart: string) => void }) {
  return (
    <Panel
      title="Historie období"
      summary={history.rows === null ? undefined : history.rows.length === 0 ? 'Zatím nic' : `Poslední výsledek ${history.rows[0].result < 0 ? `schodek ${money(-history.rows[0].result)}` : money(history.rows[0].result)}`}
      description="Skutečné výsledky minulých období. Plánované peníze se do nich nepočítají."
    >
      <div>
        {history.error ? (
          <div role="alert" className="space-y-3 rounded-2xl bg-muted p-4 text-sm">
            <p>{history.error}</p>
            <Button variant="secondary" onClick={history.retry}>
              Zkusit znovu
            </Button>
          </div>
        ) : history.rows === null ? (
          <p className="flex items-center gap-2 text-sm text-fg-secondary">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Načítám…
          </p>
        ) : history.rows.length === 0 ? (
          <EmptyState icon={<History />} title="Zatím tu nejsou žádná minulá období" description="Až skončí první rozpočtové období, uvidíte tu jeho příjmy, výdaje a výsledek." />
        ) : (
          <ul className="divide-y divide-border">
            {history.rows.map((row) => (
              <li key={row.periodStart} className="space-y-2 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-medium">{periodLabel(row.periodStart, isoFromDayNumber(dayNumber(row.periodEnd) - 1))}</p>
                  <p className={`text-sm font-semibold tabular-nums ${row.result < 0 ? 'text-destructive' : ''}`}>
                    {row.result < 0 ? `Schodek ${money(-row.result)}` : `Výsledek ${money(row.result)}`}
                  </p>
                </div>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-fg-secondary sm:grid-cols-2 lg:grid-cols-3">
                  <Item label="Rozpočet" value={money(row.budget)} />
                  <Item label="Příjmy" value={money(row.received)} />
                  <Item label="Výdaje" value={money(row.expenses)} />
                  {row.saved !== 0 && <Item label="Uloženo do Kapes" value={money(row.saved)} />}
                  {row.carryIn !== 0 && <Item label="Převod z předchozího" value={signedMoney(row.carryIn)} />}
                  {row.carryOut !== null && <Item label="Převod do dalšího" value={signedMoney(row.carryOut)} />}
                </dl>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-fg-secondary">{row.closed ? 'Uzavřeno' : 'Neuzavřeno'}</p>
                  {onOpenExpenses && (
                    <Button variant="ghost" className="min-h-10" onClick={() => onOpenExpenses(row.periodStart)} aria-label={`Zobrazit výdaje období ${periodLabel(row.periodStart, isoFromDayNumber(dayNumber(row.periodEnd) - 1))}`}>
                      Zobrazit výdaje
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 justify-between gap-2">
      <dt>{label}</dt>
      <dd className="break-words tabular-nums text-foreground">{value}</dd>
    </div>
  )
}
