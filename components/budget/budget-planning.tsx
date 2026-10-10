import { useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, CircleDashed, Loader2, Pencil, Plus, Wallet } from 'lucide-react'
import { BudgetOutlookCard } from '@/components/budget/budget-outlook-card'
import { BudgetPeriodSettings } from '@/components/budget/budget-period-settings'
import { IncomeModal } from '@/components/budget/income-modal'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PeriodClosingSheet } from '@/components/budget/period-closing-sheet'
import { PeriodHistory } from '@/components/budget/period-history'
import { Panel } from '@/components/budget/panel'
import { PlannedCarryCard } from '@/components/budget/planned-carry-card'
import { PlannedExpensesCard } from '@/components/budget/planned-expenses-card'
import { PocketsCard } from '@/components/budget/pockets-card'
import type { usePeriodHistory } from '@/components/shell/use-period-history'
import type { usePlannedExpenses } from '@/components/shell/use-planned-expenses'
import { incomeTotals } from '@/lib/budget-balances'
import { evaluatePeriod, periodResult } from '@/lib/budget-closing'
import { OUTLOOK_PERIODS, projectOutlook } from '@/lib/budget-outlook'
import { nextPeriodNeed, recommendDeficit, recommendSurplus } from '@/lib/budget-recommendation'
import { forecastPeriod, type Advice, type Commitment } from '@/lib/budget-forecast'
import { periodEnd as periodEndOf } from '@/lib/budget'
import { periodConfigKey, type PeriodConfig } from '@/lib/budget-period'
import { money, periodLabel, shortDate } from '@/lib/format'
import type { Income } from '@/lib/types'
import type { useBudgetLedger } from '@/components/shell/use-budget-ledger'
import type { useBudgetOutlook } from '@/components/shell/use-budget-outlook'
import type { useIncomes } from '@/components/shell/use-incomes'

type IncomesState = ReturnType<typeof useIncomes>
type OutlookState = ReturnType<typeof useBudgetOutlook>
type LedgerState = ReturnType<typeof useBudgetLedger>
type HistoryState = ReturnType<typeof usePeriodHistory>
type PlannedState = ReturnType<typeof usePlannedExpenses>

const round2 = (value: number) => Math.round(value * 100) / 100

/** How many periods ahead can be planned (the outlook covers the running period and this many more). */
const MAX_AHEAD = OUTLOOK_PERIODS - 1

/** "+1 800 Kč" / "−1 800 Kč": a transfer from the previous period always shows its sign (docs/15 §21). */
const signedMoney = (value: number) => (value > 0 ? `+${money(value)}` : value < 0 ? `−${money(-value)}` : money(0))

/** The wording of a forecast advice (docs/15 §16). Amounts come from the pure forecast; only text is here. */
function adviceText(advice: Advice): string {
  switch (advice.kind) {
    case 'shortfall':
      return `Podle vašeho plánu vám na konci období bude chybět přibližně ${money(advice.amount)}.`
    case 'postpone-savings':
      return `Můžete odložit plánované úspory do Kapes (${money(advice.amount)}).`
    case 'trim-expenses':
      return `Můžete ubrat z plánovaných výdajů (${money(advice.amount)}).`
    case 'use-pocket':
      return advice.isReserve ? `Můžete sáhnout do finanční rezervy ${advice.pocketName} (${money(advice.amount)}).` : `Můžete využít Kapsu ${advice.pocketName} (${money(advice.amount)}).`
    case 'carry-deficit':
      return `Zbylých ${money(advice.amount)} by přešlo jako záporný převod do dalšího období.`
    case 'payment-risk':
      return `Než dorazí očekávané příjmy, na splatné platby chybí ${money(advice.amount)}.`
  }
}

/** Rozpočet → Plánování (docs/15_BUDGET_PERIODS.md §7–8, §21): the period's income, with real money
 *  (received income, paid expenses) kept visibly apart from planned money (income still to come).
 *  A planned income does not touch the actual balance until it is marked received. */
export function BudgetPlanning({
  period,
  periodEnd,
  today,
  spent,
  incomes,
  pockets,
  history,
  plannedExpenses,
  commitments,
  commitmentsFor,
  outlook,
  offset,
  onOffsetChange,
  onOpenExpenses,
  budgetPeriod,
  onChangePeriod,
}: {
  /** First and last day of the period shown (the running one, or one ahead — see `offset`). */
  period: string
  periodEnd: string
  today: string
  /** What was actually paid in the running period (expenses are always real money). */
  spent: number
  incomes: IncomesState
  /** Kapsy, the carry from the previous period and the period to close. */
  pockets: LedgerState
  /** The past periods (docs/15 §18). */
  history: HistoryState
  /** Planned expenses of the period (docs/15 §7). */
  plannedExpenses: PlannedState
  /** Recurring payments of the period that are neither paid nor skipped yet. */
  commitments: Commitment[]
  /** The total of the recurring payments due in the period starting on that date and not yet handled. */
  commitmentsFor: (periodStart: string) => number
  /** What the periods ahead are expected to look like (docs/15 §14, §16). */
  outlook: OutlookState
  /** 0 = the running period; n = the n-th period ahead, which can only be planned (not paid or closed). */
  offset: number
  onOffsetChange: (offset: number) => void
  /** Opens a past period's expenses in Výdaje. */
  onOpenExpenses: (periodStart: string) => void
  /** The household's period setting, and how to change it. */
  budgetPeriod: PeriodConfig
  onChangePeriod: (period: PeriodConfig) => Promise<void>
}) {
  const [editing, setEditing] = useState<'new' | Income | null>(null)
  const [receiving, setReceiving] = useState<string | null>(null)
  const [receiveError, setReceiveError] = useState('')
  const [closing, setClosing] = useState(false)
  const [reopenError, setReopenError] = useState('')
  const totals = useMemo(() => incomeTotals(incomes.incomes ?? []), [incomes.incomes])
  const plannedOpen = round2((plannedExpenses.plannedExpenses ?? []).filter((entry) => entry.status === 'planned').reduce((sum, entry) => sum + entry.amount, 0))
  const ledger = pockets.ledger
  // docs/15 §9.1, §14: received income + the carry from the previous period − paid expenses − money
  // really moved into Kapsy. Until the ledger has loaded the carry and transfers are unknown (0).
  const balance = periodResult({ received: totals.received, expenses: spent, transfers: ledger?.transfers ?? 0 }, ledger?.carryIn ?? 0)
  // docs/15 §9.2, §9.4, §16–17: the deterministic forecast (lib/budget-forecast.ts) from the same numbers.
  const forecast = ledger
    ? forecastPeriod({ actual: balance, expectedIncome: totals.planned, commitments, plannedExpenses: plannedOpen, plannedTransfers: ledger.plannedTransfersLeft, pockets: ledger.pockets })
    : null
  // docs/15 §12, §17: what ANITKA suggests for the period waiting to be closed. It only pre-fills the
  // closing form; the user changes it freely and nothing moves until they confirm.
  // The period waiting to be closed is followed by the running one, so what the running period holds and
  // expects is what its obligations are measured against (docs/15 §14): the money it already has
  // (`balance`), its planned income, its payments and planned expenses. What is still missing is the
  // part of the surplus to keep for it — shown in the closing sheet as "vyhrazeno na závazky".
  const reservedForNext = nextPeriodNeed({ commitments: commitments.reduce((sum, item) => sum + item.amount, 0), plannedExpenses: plannedOpen, plannedIncome: totals.planned, onHand: balance })
  const recommendation = useMemo(() => {
    if (offset !== 0 || !ledger?.toClose) return null
    const verdict = evaluatePeriod(ledger.toClose.result)
    const candidates = ledger.pockets
    if (verdict.kind === 'surplus') {
      return recommendSurplus({ surplus: verdict.amount, pockets: candidates, nextNeed: reservedForNext, plannedCarry: ledger.toClose.plannedCarry, reserveFallbackGoal: ledger.toClose.expenses })
    }
    if (verdict.kind === 'deficit') return recommendDeficit({ deficit: verdict.amount, pockets: candidates })
    return null
  }, [offset, ledger, reservedForNext])
  // docs/15 §14, §16: the periods ahead, each starting from the carry the one before hands over.
  const projection = outlook.outlook
    ? projectOutlook({
        actualNow: outlook.outlook.actualNow,
        spentNow: outlook.outlook.spentNow,
        periods: outlook.outlook.periods.map((entry) => ({ ...entry, commitments: commitmentsFor(entry.periodStart) })),
      })
    : null
  const viewed = projection?.[offset] ?? null
  const future = offset > 0
  // Something added for a period ahead starts on its first day, not today.
  const entryDate = future ? period : today
  const labelOf = (start: string) => periodLabel(start, periodEndOf(start, budgetPeriod))
  const plannedSavings = round2((ledger?.pockets ?? []).reduce((sum, pocket) => sum + (pocket.plannedContribution ?? 0), 0))

  async function receive(id: string) {
    setReceiving(id)
    setReceiveError('')
    try {
      await incomes.receive(id)
    } catch (error) {
      setReceiveError(error instanceof Error ? error.message : 'Příjem se nepodařilo označit jako přijatý.')
    } finally {
      setReceiving(null)
    }
  }

  return (
    <div className="space-y-5 lg:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-sm text-fg-secondary">
          {future ? 'Plánujete období' : 'Rozpočtové období'}: <span className="font-semibold text-foreground">{periodLabel(period, periodEnd)}</span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" className="min-h-11 min-w-11" onClick={() => onOffsetChange(offset - 1)} disabled={offset === 0} aria-label="Předchozí období">
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="ghost" className="min-h-11 min-w-11" onClick={() => onOffsetChange(offset + 1)} disabled={offset >= MAX_AHEAD} aria-label="Následující období">
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      {future && (
        <section className="surface space-y-3 p-5 sm:p-6" aria-label="Plán budoucího období">
          <p className="text-sm font-semibold">Plán budoucího období</p>
          <p className="text-sm text-fg-secondary">Jen plánované peníze. Nic z toho se nepočítá do skutečného zůstatku, dokud období nezačne a peníze skutečně nepřijdou nebo neodejdou.</p>
          {outlook.error ? (
            <div role="alert" className="space-y-3 rounded-2xl bg-muted p-4 text-sm">
              <p>{outlook.error}</p>
              <Button variant="secondary" onClick={outlook.retry}>
                Zkusit znovu
              </Button>
            </div>
          ) : viewed === null ? (
            <p className="flex items-center gap-2 text-sm text-fg-secondary">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Načítám…
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Figure label="Začne s" value={signedMoney(viewed.opening)} />
              <Figure label="Očekávané příjmy" value={money(viewed.income)} />
              <Figure label="Očekávané výdaje" value={money(viewed.spending)} />
              {viewed.plannedTransfers > 0 && <Figure label="Úspory do Kapes" value={money(viewed.plannedTransfers)} />}
              <Figure label="Predikovaný zůstatek" value={money(viewed.predicted)} strong />
              <Figure label="Převod do dalšího" value={signedMoney(viewed.carryOut)} />
            </dl>
          )}
          <p className="text-xs text-fg-secondary">Výdaje vycházejí z rozpočtu období; pravidelné platby a plánované výdaje, které ho přesahují, ho navýší.</p>
        </section>
      )}

      {!future && ledger?.toClose && (
        <section className="surface space-y-3 p-5 sm:p-6" aria-label="Uzavření období">
          <p className="text-sm font-semibold">Minulé období skončilo</p>
          <p className="text-sm text-fg-secondary">
            {periodLabel(ledger.toClose.periodStart, ledger.toClose.periodEnd)}:{' '}
            {ledger.toClose.result > 0
              ? `zbylo ${money(ledger.toClose.result)}. Rozhodněte, co s nimi.`
              : ledger.toClose.result < 0
                ? `schodek ${money(-ledger.toClose.result)}. Rozhodněte, jak ho pokrýt.`
                : 'vyrovnané.'}
          </p>
          <Button onClick={() => setClosing(true)}>Uzavřít období</Button>
        </section>
      )}

      {!future && (
      <section className="surface p-5 sm:p-6" aria-label="Skutečně">
        <p className="text-sm font-semibold">Skutečně</p>
        <p className="mt-1 text-xs text-fg-secondary">Jen peníze, které už opravdu přišly a odešly.</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Figure label="Přijaté příjmy" value={money(totals.received)} />
          <Figure label="Zaplacené výdaje" value={money(spent)} />
          {ledger && ledger.carryIn !== 0 && <Figure label="Převod z předchozího období" value={signedMoney(ledger.carryIn)} />}
          {ledger && ledger.transfers !== 0 && <Figure label="Uloženo do Kapes" value={money(ledger.transfers)} />}
          <Figure label="Skutečný zůstatek" value={money(balance)} strong className="col-span-2 sm:col-span-1" />
        </dl>
        {ledger?.previousClosedStart && (
          <div className="mt-3 space-y-2">
            <Button
              variant="ghost"
              className="min-h-10"
              onClick={() => {
                setReopenError('')
                pockets.reopenPeriod(ledger.previousClosedStart!).catch((error: unknown) => setReopenError(error instanceof Error ? error.message : 'Období se nepodařilo znovu otevřít.'))
              }}
            >
              Znovu otevřít předchozí období
            </Button>
            {reopenError && (
              <p role="alert" className="text-sm text-destructive">
                {reopenError}
              </p>
            )}
          </div>
        )}
      </section>
      )}

      {/* One card for everything that is only expected (it used to be two): the prediction first, and
          what it is made of in one line, so a phone shows the answer without a second screen. */}
      {!future && forecast && (
        <section className="surface p-5 sm:p-6" aria-label="Predikce">
          <p className="text-sm font-semibold">Odhad konce období</p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <Figure label="Predikovaný zůstatek" value={money(forecast.predicted)} strong />
            <Figure label="Dostupný zůstatek" value={money(forecast.available)} />
          </dl>
          <p className="mt-3 text-xs text-fg-secondary">
            Plánováno, nepočítá se do skutečného zůstatku: očekávané příjmy {money(totals.planned)}, plánované výdaje {money(plannedOpen)}, plánované úspory do Kapes {money(plannedSavings)}. Platby, které
            nejsou zaplacené, se odečítají; běžné nákupy se neodhadují.
          </p>
          {forecast.advice.length > 0 && (
            <ul role="status" className="mt-4 space-y-2 rounded-2xl bg-muted p-4 text-sm">
              {forecast.advice.map((entry, index) => (
                <li key={index} className={entry.kind === 'shortfall' || entry.kind === 'payment-risk' ? 'font-medium' : 'text-fg-secondary'}>
                  {adviceText(entry)}
                </li>
              ))}
              <li className="text-xs text-fg-secondary">Jde jen o návrhy. ANITKA nic nepřesune bez vašeho potvrzení.</li>
            </ul>
          )}
        </section>
      )}

      <Panel
        key={`incomes-${future}`}
        title="Příjmy"
        summary={incomes.incomes === null ? undefined : incomes.incomes.length === 0 ? 'Zatím žádné' : `Přijato ${money(totals.received)} · čeká ${money(totals.planned)}`}
        description="Výplata, brigáda, dávky… Plánovaný příjem označíte jako přijatý, až dorazí."
        defaultOpen={future}
        action={
          <Button variant="secondary" onClick={() => setEditing('new')}>
            <Plus aria-hidden="true" /> Přidat příjem
          </Button>
        }
      >
        <div>
          {incomes.error ? (
            <div role="alert" className="space-y-3 rounded-2xl bg-muted p-4 text-sm">
              <p>{incomes.error}</p>
              <Button variant="secondary" onClick={incomes.retry}>
                Zkusit znovu
              </Button>
            </div>
          ) : incomes.incomes === null ? (
            <p className="flex items-center gap-2 text-sm text-fg-secondary">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Načítám…
            </p>
          ) : incomes.incomes.length === 0 ? (
            <EmptyState
              icon={<Wallet />}
              title="V tomto období zatím nejsou žádné příjmy"
              description="Přidejte výplatu nebo jiný příjem. Plánovaný příjem pomůže odhadnout, kolik vám zbude."
              action={
                <Button onClick={() => setEditing('new')}>
                  <Plus aria-hidden="true" /> Přidat příjem
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {incomes.incomes.map((income) => (
                <li key={income.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="break-words text-sm font-medium">{income.description || 'Příjem'}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-secondary">
                      {income.status === 'actual' ? <Check className="size-3.5" aria-hidden="true" /> : <CircleDashed className="size-3.5" aria-hidden="true" />}
                      {income.status === 'actual' ? `Přijato ${shortDate(income.date)}` : `Plánováno na ${shortDate(income.date)}`}
                      {income.status === 'planned' && income.date < today ? ' (po termínu)' : ''}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{money(income.amount)}</p>
                  <div className="flex items-center gap-2">
                    {income.status === 'planned' && !future && (
                      <Button variant="secondary" className="min-h-10" onClick={() => void receive(income.id)} disabled={receiving === income.id}>
                        {receiving === income.id ? 'Ukládám…' : 'Přijato'}
                      </Button>
                    )}
                    <Button variant="ghost" className="min-h-10" onClick={() => setEditing(income)} aria-label={`Upravit příjem ${income.description || ''}`.trim()}>
                      <Pencil aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {receiveError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {receiveError}
            </p>
          )}
        </div>
      </Panel>

      {/* The blocks start open for a period ahead and closed for the running one; the key remounts them
          when the user moves between the two, since `defaultOpen` is only read on mount. */}
      <PlannedExpensesCard key={`planned-${future}`} state={plannedExpenses} today={entryDate} canPay={!future} defaultOpen={future} />

      {!future && <PocketsCard ledger={pockets} available={balance} />}

      <PlannedCarryCard defaultOpen={future} key={`${period}|${viewed?.plannedCarry ?? ''}`} planned={viewed?.plannedCarry ?? null} row={viewed} onSave={(amount) => outlook.planCarry(period, amount)} />

      {!future && (
        <BudgetOutlookCard state={outlook} periods={projection} labelOf={labelOf} awaitingClose={Boolean(ledger?.toClose)} onOpen={onOffsetChange} />
      )}

      {!future && <PeriodHistory history={history} onOpenExpenses={onOpenExpenses} />}

      {!future && <BudgetPeriodSettings key={periodConfigKey(budgetPeriod)} period={budgetPeriod} today={today} onSave={onChangePeriod} />}

      {closing && !future && ledger?.toClose && (
        <PeriodClosingSheet preview={ledger.toClose} pockets={ledger.pockets} recommendation={recommendation} reservedForNext={reservedForNext} onClose={() => setClosing(false)} onConfirm={pockets.closePeriod} />
      )}

      {editing && (
        <IncomeModal
          today={entryDate}
          income={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            if (editing === 'new') await incomes.add(values)
            else await incomes.update(editing.id, { amount: values.amount, description: values.description, date: values.date })
            setEditing(null)
          }}
          onDelete={
            editing === 'new'
              ? undefined
              : async () => {
                  await incomes.remove(editing.id)
                  setEditing(null)
                }
          }
        />
      )}
    </div>
  )
}

function Figure({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={`min-w-0 rounded-2xl bg-muted/60 p-3 ${className ?? ''}`}>
      <dt className="text-xs text-fg-secondary">{label}</dt>
      <dd className={`mt-1 break-words tabular-nums ${strong ? 'text-lg font-semibold' : 'text-base font-medium'}`}>{value}</dd>
    </div>
  )
}
