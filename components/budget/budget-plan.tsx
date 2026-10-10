import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight, Loader2, Pencil, PiggyBank } from 'lucide-react'
import { Panel } from '@/components/budget/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { budgetForPeriod, nextPeriodStart, periodEnd, periodStart, savingsHistory, spendingByPeriod } from '@/lib/budget'
import type { PeriodConfig } from '@/lib/budget-period'
import { periodLabel, wholeMoney } from '@/lib/format'

/** How many finished periods the card lists before "Zobrazit všechna". */
const SHOWN_PERIODS = 6

/** Rozpočet ▸ Přehled: the budget of this and the next period, the savings goal and what the
 *  finished periods saved (budget − spending, docs/15_BUDGET_PERIODS.md). Every number comes from
 *  lib/budget.ts. A finished period opens in Výdaje. */
export function BudgetPlanCard({
  today,
  period,
  defaultBudget,
  periodBudgets,
  savingsGoal,
  spent,
  history,
  historyError,
  onRetryHistory,
  onEdit,
  onOpenPeriod,
}: {
  today: string
  period: PeriodConfig
  /** The budget from Profil, used by every period without its own. */
  defaultBudget: number
  periodBudgets: Record<string, number>
  savingsGoal: number
  /** Spent so far in the current period (from the expenses on the page, always up to date). */
  spent: number
  /** Spending per day, all of it; null while it loads. */
  history: { date: string; total: number }[] | null
  historyError: string
  onRetryHistory: () => void
  onEdit: () => void
  onOpenPeriod: (period: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const current = periodStart(today, period)
  const next = nextPeriodStart(current, period)
  const currentBudget = budgetForPeriod(current, periodBudgets, defaultBudget)
  const nextBudget = budgetForPeriod(next, periodBudgets, defaultBudget)
  const left = currentBudget - spent
  const past = useMemo(
    () => (history ? savingsHistory(spendingByPeriod(history, period), current, (start) => budgetForPeriod(start, periodBudgets, defaultBudget)) : null),
    [history, period, current, periodBudgets, defaultBudget],
  )
  const newestFirst = past ? past.periods.slice().reverse() : []
  const shown = showAll ? newestFirst : newestFirst.slice(0, SHOWN_PERIODS)

  return (
    <Panel
      title="Plán a úspory"
      summary={`Toto období ${currentBudget > 0 ? wholeMoney(currentBudget) : 'bez rozpočtu'}${savingsGoal > 0 ? ` · cíl úspor ${wholeMoney(savingsGoal)}` : ''}`}
      description="Rozpočet na období, cíl úspor a co zbylo v minulých obdobích."
      action={
        <Button variant="outline" onClick={onEdit}>
          <Pencil aria-hidden="true" /> Upravit
        </Button>
      }
    >
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <PlanFigure label="Toto období" value={currentBudget > 0 ? wholeMoney(currentBudget) : 'nenastaven'} hint={periodBudgets[current] != null ? 'vlastní rozpočet' : 'výchozí z profilu'} />
        <PlanFigure label="Příští období" value={nextBudget > 0 ? wholeMoney(nextBudget) : 'nenastaven'} hint={periodLabel(next, periodEnd(next, period))} />
        <div className="col-span-2 sm:col-span-1">
          <PlanFigure label="Měsíční cíl úspor" value={savingsGoal > 0 ? wholeMoney(savingsGoal) : 'nenastaven'} />
        </div>
      </dl>

      {currentBudget > 0 && (
        <div className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-fg-secondary">{left >= 0 ? 'Zatím zbývá v tomto období' : 'Toto období je přečerpané o'}</span>
            <span className={left >= 0 ? 'font-semibold' : 'font-semibold text-destructive'}>{wholeMoney(Math.abs(left))}</span>
          </p>
          {savingsGoal > 0 &&
            (left >= savingsGoal ? (
              <p className="mt-1 text-fg-secondary">Na cíl úspor stačí utratit nejvýš {wholeMoney(left - savingsGoal)} do konce období.</p>
            ) : (
              <p className="mt-1 flex items-start gap-1.5 font-medium text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Na cíl úspor chybí {wholeMoney(savingsGoal - Math.max(left, 0))}.
              </p>
            ))}
        </div>
      )}

      <div className="mt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <PiggyBank className="size-4 text-accent-text" aria-hidden="true" /> Minulá období
          </p>
          {past && past.periods.length > 0 && (
            <p className="text-sm">
              Ušetřeno celkem <span className={past.total >= 0 ? 'font-semibold' : 'font-semibold text-destructive'}>{signedMoney(past.total)}</span>
            </p>
          )}
        </div>

        {historyError ? (
          <div role="alert" className="mt-3 rounded-2xl bg-muted px-4 py-3 text-sm">
            <p className="text-destructive">{historyError}</p>
            <button type="button" onClick={onRetryHistory} className="mt-2 min-h-10 rounded-xl px-3 font-medium text-accent-text hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Zkusit znovu
            </button>
          </div>
        ) : !past ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-fg-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Načítám minulá období…
          </p>
        ) : past.periods.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-muted px-4 py-4 text-sm text-fg-secondary">
            Zatím žádné ukončené období s rozpočtem. Po konci tohoto období tu uvidíte, kolik zbylo.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {shown.map((entry) => (
              <li key={entry.period}>
                <button
                  type="button"
                  onClick={() => onOpenPeriod(entry.period)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-muted px-4 py-3 text-left text-sm hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium capitalize">{periodLabel(entry.period, periodEnd(entry.period, period))}</span>
                    <span className="block break-words text-xs text-fg-muted">
                      utraceno {wholeMoney(entry.spent)} z {wholeMoney(entry.budget)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={entry.saved >= 0 ? 'block font-semibold' : 'block font-semibold text-destructive'}>{signedMoney(entry.saved)}</span>
                    <span className="block text-xs text-fg-muted">{entry.saved >= 0 ? 'ušetřeno' : 'přečerpáno'}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                </button>
              </li>
            ))}
            {newestFirst.length > SHOWN_PERIODS && (
              <li>
                <button type="button" onClick={() => setShowAll((value) => !value)} className="min-h-10 rounded-xl px-3 text-sm font-medium text-accent-text hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {showAll ? 'Zobrazit méně' : `Zobrazit všechna (${newestFirst.length})`}
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </Panel>
  )
}

function PlanFigure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-muted px-4 py-3">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-1 break-words text-base font-semibold tracking-tight sm:text-lg">{value}</dd>
      {hint && <dd className="mt-0.5 break-words text-xs text-fg-muted">{hint}</dd>}
    </div>
  )
}

/** "+2 500 Kč" / "−1 000 Kč": the sign is spelled out, never shown by colour alone. */
function signedMoney(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${wholeMoney(Math.abs(value))}`
}

/** "Upravit rozpočet": this and the next period's own budget (empty = the default from Profil) and the
 *  monthly savings goal (empty = none). Only changed values are sent; the server checks them again. */
export function BudgetPlanSheet({
  today,
  period,
  defaultBudget,
  periodBudgets,
  savingsGoal,
  onClose,
  onSave,
}: {
  today: string
  period: PeriodConfig
  defaultBudget: number
  periodBudgets: Record<string, number>
  savingsGoal: number
  onClose: () => void
  onSave: (changes: { periodBudgets: { period: string; amount: number | null }[]; savingsGoal?: number }) => Promise<void>
}) {
  const current = periodStart(today, period)
  const next = nextPeriodStart(current, period)
  const asText = (value: number | undefined) => (value != null && value > 0 ? String(value).replace('.', ',') : '')
  const [drafts, setDrafts] = useState({
    current: periodBudgets[current] != null ? String(periodBudgets[current]).replace('.', ',') : '',
    next: periodBudgets[next] != null ? String(periodBudgets[next]).replace('.', ',') : '',
    goal: asText(savingsGoal),
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const parse = (text: string) => {
    const clean = text.replace(/[\s ]/g, '').replace(',', '.')
    return clean === '' ? null : Number(clean)
  }

  async function save() {
    const periodChanges: { period: string; amount: number | null }[] = []
    for (const [period, text] of [
      [current, drafts.current],
      [next, drafts.next],
    ] as const) {
      const amount = parse(text)
      if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
        setError('Rozpočet musí být částka 0 Kč nebo vyšší, nebo prázdný.')
        return
      }
      if (amount !== (periodBudgets[period] ?? null)) periodChanges.push({ period, amount })
    }
    const goal = parse(drafts.goal) ?? 0
    if (!Number.isFinite(goal) || goal < 0) {
      setError('Cíl úspor musí být částka 0 Kč nebo vyšší, nebo prázdný.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSave({ periodBudgets: periodChanges, ...(goal !== savingsGoal ? { savingsGoal: goal } : {}) })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rozpočet se nepodařilo uložit.')
    } finally {
      setBusy(false)
    }
  }

  const defaultHint = defaultBudget > 0 ? ` · výchozí ${wholeMoney(defaultBudget)}` : ''
  const fields = [
    { key: 'current' as const, label: 'Toto období', hint: periodLabel(current, periodEnd(current, period)) + defaultHint, placeholder: 'výchozí' },
    { key: 'next' as const, label: 'Příští období', hint: periodLabel(next, periodEnd(next, period)) + defaultHint, placeholder: 'výchozí' },
    { key: 'goal' as const, label: 'Měsíční cíl úspor', hint: 'Kolik z rozpočtu ušetřit za období.', placeholder: 'bez cíle' },
  ]

  return (
    <Sheet
      open
      onClose={onClose}
      title="Upravit rozpočet"
      description="Prázdný rozpočet období znamená výchozí rozpočet z profilu. Upozornění při 80 % a 100 % se řídí rozpočtem daného období."
      footer={
        <>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={() => void save()} disabled={busy}>
            {busy ? 'Ukládám…' : 'Uložit'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {fields.map((field) => (
          <label key={field.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{field.label}</span>
              <span className="block break-words text-xs text-fg-muted">{field.hint}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Input
                value={drafts[field.key]}
                onChange={(event) => setDrafts((current) => ({ ...current, [field.key]: event.target.value }))}
                type="text"
                inputMode="decimal"
                placeholder={field.placeholder}
                aria-label={field.label}
                className="w-32 px-3 text-right"
              />
              <span className="text-fg-muted">Kč</span>
            </span>
          </label>
        ))}
      </div>
    </Sheet>
  )
}
