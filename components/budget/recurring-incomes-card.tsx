'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import {
  confirmRecurringIncomeAction,
  getRecurringIncomeOverviewAction,
  saveRecurringIncomeAction,
  skipRecurringIncomeAction,
  stopRecurringIncomeAction,
} from '@/app/actions/recurring-incomes'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/budget/panel'
import { RecurringIncomeModal } from '@/components/budget/recurring-income-modal'
import { RecurringIncomeReceiptModal } from '@/components/budget/recurring-income-receipt-modal'
import { money, shortDate } from '@/lib/format'
import type { RecurringIncome, RecurringIncomeInput, DueRecurringIncome } from '@/lib/recurring-incomes'
import type { Income } from '@/lib/types'

type Overview = Awaited<ReturnType<typeof getRecurringIncomeOverviewAction>>

export function RecurringIncomesCard({
  today,
  onIncomeChanged,
}: {
  today: string
  onIncomeChanged: () => void
}) {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<RecurringIncome | 'new' | null>(null)
  const [confirming, setConfirming] = useState<DueRecurringIncome | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setOverview(await getRecurringIncomeOverviewAction())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pravidelné příjmy se nepodařilo načíst.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function save(input: RecurringIncomeInput) {
    if (editing === 'new') await saveRecurringIncomeAction(input)
    else if (editing) await saveRecurringIncomeAction(input, editing.id)
    setEditing(null)
    await refresh()
    onIncomeChanged()
  }

  async function stop(income: RecurringIncome) {
    setBusy(income.id)
    setError('')
    try {
      await stopRecurringIncomeAction(income.id)
      await refresh()
      onIncomeChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pravidelný příjem se nepodařilo zastavit.')
    } finally {
      setBusy(null)
    }
  }

  async function skip(item: DueRecurringIncome) {
    const key = `${item.income.id}|${item.dueDate}`
    setBusy(key)
    setError('')
    try {
      await skipRecurringIncomeAction(item.income.id, item.dueDate)
      await refresh()
      onIncomeChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Termín se nepodařilo přeskočit.')
    } finally {
      setBusy(null)
    }
  }

  async function confirm(item: DueRecurringIncome, actual: { amount: number; date: string }) {
    setBusy(`${item.income.id}|${item.dueDate}`)
    setError('')
    try {
      await confirmRecurringIncomeAction(item.income.id, item.dueDate, actual)
      setConfirming(null)
      await refresh()
      onIncomeChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Příjem se nepodařilo potvrdit.')
      throw err
    } finally {
      setBusy(null)
    }
  }

  const summary = overview
    ? overview.payments.filter((income) => income.active).length === 0
      ? 'Zatím žádné aktivní pravidelné příjmy'
      : `${overview.payments.filter((income) => income.active).length} aktivních pravidelných příjmů`
    : undefined

  return (
    <>
      <Panel
        title="Pravidelné příjmy"
        summary={summary}
        description="Očekávané příjmy se započítávají do plánu, ne do skutečného zůstatku. Při potvrzení se zadává částka, která opravdu dorazila."
        action={<Button variant="secondary" onClick={() => setEditing('new')}><Plus aria-hidden="true" /> Přidat pravidelný příjem</Button>}
      >
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        {loading && !overview ? <p className="text-sm text-fg-secondary">Načítám…</p> : null}
        {overview && (
          <div className="space-y-5">
            <section>
              <h3 className="text-sm font-semibold">K potvrzení</h3>
              {overview.due.length === 0 ? (
                <p className="mt-2 text-sm text-fg-secondary">Žádný pravidelný příjem nečeká na potvrzení.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {overview.due.map((item) => (
                    <li key={`${item.income.id}|${item.dueDate}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{item.income.description}</p>
                        <p className="text-xs text-fg-secondary">Očekáváno {shortDate(item.dueDate)} · {money(item.income.expectedAmount)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => setConfirming(item)} disabled={busy === `${item.income.id}|${item.dueDate}`}>Potvrdit částku</Button>
                        <Button size="sm" variant="ghost" onClick={() => void skip(item)} disabled={busy === `${item.income.id}|${item.dueDate}`}>Přeskočit</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="text-sm font-semibold">Brzy očekávané</h3>
              {overview.upcoming.length === 0 ? (
                <p className="mt-2 text-sm text-fg-secondary">V příštích 31 dnech není naplánovaný žádný další příjem.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {overview.upcoming.map((item) => (
                    <li key={`${item.income.id}|${item.dueDate}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span>{item.income.description} · {shortDate(item.dueDate)}</span>
                      <span className="shrink-0 font-medium tabular-nums">{money(item.income.expectedAmount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="text-sm font-semibold">Všechny pravidelné příjmy</h3>
              {overview.payments.length === 0 ? (
                <p className="mt-2 text-sm text-fg-secondary">Pravidelný příjem přidáte výše. Jednorázové příjmy zůstávají v běžném formuláři.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {overview.payments.map((income) => (
                    <li key={income.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{income.description}</p>
                        <p className="text-xs text-fg-secondary">{money(income.expectedAmount)} · {income.intervalMonths === 1 ? 'měsíčně' : income.intervalMonths === 3 ? 'čtvrtletně' : income.intervalMonths === 6 ? 'pololetně' : 'ročně'} · první termín {shortDate(income.startDate)}{income.active ? '' : ' · zastaveno'}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(income)} aria-label={`Upravit ${income.description}`}><Pencil aria-hidden="true" /></Button>
                        {income.active && <Button size="sm" variant="ghost" onClick={() => void stop(income)} disabled={busy === income.id}>Zastavit</Button>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
        {error && <Button className="mt-3" variant="secondary" onClick={() => void refresh()}>Zkusit znovu</Button>}
      </Panel>

      {editing && (
        <RecurringIncomeModal
          today={today}
          income={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
      {confirming && (
        <RecurringIncomeReceiptModal
          income={{
            id: `recurring-income:${confirming.income.id}:${confirming.dueDate}`,
            amount: confirming.income.expectedAmount,
            description: confirming.income.description,
            date: confirming.dueDate,
            status: 'planned',
            recurringIncomeId: confirming.income.id,
            occurrenceDueDate: confirming.dueDate,
          } satisfies Income}
          today={today}
          onClose={() => setConfirming(null)}
          onConfirm={(actual) => confirm(confirming, actual)}
        />
      )}
    </>
  )
}
