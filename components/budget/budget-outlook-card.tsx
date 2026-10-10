import { useState } from 'react'
import { CalendarClock, Loader2 } from 'lucide-react'
import { Panel } from '@/components/budget/panel'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import type { OutlookPeriod } from '@/lib/budget-outlook'
import { money } from '@/lib/format'
import type { useBudgetOutlook } from '@/components/shell/use-budget-outlook'

type OutlookState = ReturnType<typeof useBudgetOutlook>

/** How many of the coming periods are listed before "Zobrazit další". */
const VISIBLE = 3

/** "+1 800 Kč" / "−1 800 Kč" (docs/15 §21). */
const signedMoney = (value: number) => (value > 0 ? `+${money(value)}` : value < 0 ? `−${money(-value)}` : money(0))

/** Rozpočet → Plánování → Výhled (docs/15_BUDGET_PERIODS.md §14, §16): the periods ahead with where each
 *  is expected to start and end. Estimates from the plan — planned income, the period's budget, known
 *  payments and planned expenses — never actual money; the figures change when the plan does. */
export function BudgetOutlookCard({
  state,
  periods,
  labelOf,
  awaitingClose,
  onOpen,
}: {
  state: OutlookState
  /** The projection, running period first (null until loaded). */
  periods: OutlookPeriod[] | null
  labelOf: (periodStart: string) => string
  /** A finished period is not closed yet, so its carry is not in the starting figures. */
  awaitingClose: boolean
  /** Opens the period `offset` periods ahead for planning. */
  onOpen: (offset: number) => void
}) {
  const [all, setAll] = useState(false)
  const ahead = periods ? periods.slice(1) : []
  const shown = all ? ahead : ahead.slice(0, VISIBLE)

  return (
    <Panel
      title="Výhled dalších období"
      summary={ahead[0] ? `Příští období: ${ahead[0].predicted < 0 ? `chybět bude ${money(-ahead[0].predicted)}` : `predikce ${money(ahead[0].predicted)}`}` : undefined}
      description="Odhad z plánu: plánované příjmy, rozpočet období, pravidelné platby a plánované výdaje. Jsou to plánované peníze, ne skutečný zůstatek."
    >
      {awaitingClose && <p className="mb-4 text-sm text-fg-secondary">Minulé období ještě není uzavřené, jeho převod ve výhledu zatím chybí.</p>}

      <div>
        {state.error ? (
          <div role="alert" className="space-y-3 rounded-2xl bg-muted p-4 text-sm">
            <p>{state.error}</p>
            <Button variant="secondary" onClick={state.retry}>
              Zkusit znovu
            </Button>
          </div>
        ) : periods === null ? (
          <p className="flex items-center gap-2 text-sm text-fg-secondary">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Načítám…
          </p>
        ) : ahead.length === 0 ? (
          <EmptyState icon={<CalendarClock />} title="Výhled zatím není k dispozici" description="Zkuste to prosím za chvíli znovu." />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {shown.map((row, index) => (
                <li key={row.periodStart} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-sm font-medium">{labelOf(row.periodStart)}</p>
                    <p className={`text-sm font-semibold tabular-nums ${row.predicted < 0 ? 'text-destructive' : ''}`}>
                      {row.predicted < 0 ? `Chybět bude ${money(-row.predicted)}` : `Predikce ${money(row.predicted)}`}
                    </p>
                  </div>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-fg-secondary sm:grid-cols-2 lg:grid-cols-3">
                    <Item label="Začne s" value={signedMoney(row.opening)} />
                    <Item label="Příjmy" value={money(row.income)} />
                    <Item label="Výdaje" value={money(row.spending)} />
                    {row.plannedTransfers > 0 && <Item label="Úspory do Kapes" value={money(row.plannedTransfers)} />}
                    <Item label="Převod do dalšího" value={signedMoney(row.carryOut)} />
                  </dl>
                  <Button variant="ghost" className="min-h-10" onClick={() => onOpen(index + 1)} aria-label={`Plánovat období ${labelOf(row.periodStart)}`}>
                    Plánovat
                  </Button>
                </li>
              ))}
            </ul>
            {ahead.length > VISIBLE && (
              <Button variant="ghost" className="mt-2 min-h-10" onClick={() => setAll((current) => !current)}>
                {all ? 'Zobrazit méně' : 'Zobrazit další'}
              </Button>
            )}
          </>
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
