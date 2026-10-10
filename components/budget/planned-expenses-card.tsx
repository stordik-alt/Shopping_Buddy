import { useState } from 'react'
import { Check, CircleDashed, Loader2, Pencil, Plus, Receipt } from 'lucide-react'
import { Panel } from '@/components/budget/panel'
import { PlannedExpenseModal } from '@/components/budget/planned-expense-modal'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { money, shortDate } from '@/lib/format'
import type { PlannedExpense } from '@/lib/types'
import type { usePlannedExpenses } from '@/components/shell/use-planned-expenses'

type PlannedState = ReturnType<typeof usePlannedExpenses>

const round2 = (value: number) => Math.round(value * 100) / 100

/** Rozpočet → Plánování → Plánované výdaje (docs/15_BUDGET_PERIODS.md §7–8). Expected spending that has
 *  not happened yet; it never touches the actual balance. "Zaplaceno" turns a plan into a real expense
 *  (the same row is marked paid, so it is not counted twice). */
export function PlannedExpensesCard({
  state,
  today,
  canPay = true,
  defaultOpen = false,
}: {
  state: PlannedState
  today: string
  /** False for a period that has not begun: it cannot be paid yet. */
  canPay?: boolean
  defaultOpen?: boolean
}) {
  const open = (state.plannedExpenses ?? []).filter((entry) => entry.status === 'planned')
  const [editing, setEditing] = useState<'new' | PlannedExpense | null>(null)
  const [paying, setPaying] = useState<string | null>(null)
  const [payError, setPayError] = useState('')

  async function pay(id: string) {
    setPaying(id)
    setPayError('')
    try {
      await state.pay(id)
    } catch (error) {
      setPayError(error instanceof Error ? error.message : 'Výdaj se nepodařilo označit jako zaplacený.')
    } finally {
      setPaying(null)
    }
  }

  return (
    <Panel
      title="Plánované výdaje"
      summary={open.length === 0 ? (state.plannedExpenses === null ? undefined : 'Nic nečeká') : `${open.length}× · ${money(round2(open.reduce((sum, entry) => sum + entry.amount, 0)))}`}
      description="Velké nebo nepravidelné výdaje, které vás čekají. Do zůstatku se započítají, až je zaplatíte."
      defaultOpen={defaultOpen}
      action={
        <Button variant="secondary" onClick={() => setEditing('new')}>
          <Plus aria-hidden="true" /> Přidat
        </Button>
      }
    >
      <div>
        {state.error ? (
          <div role="alert" className="space-y-3 rounded-2xl bg-muted p-4 text-sm">
            <p>{state.error}</p>
            <Button variant="secondary" onClick={state.retry}>
              Zkusit znovu
            </Button>
          </div>
        ) : state.plannedExpenses === null ? (
          <p className="flex items-center gap-2 text-sm text-fg-secondary">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Načítám…
          </p>
        ) : state.plannedExpenses.length === 0 ? (
          <EmptyState
            icon={<Receipt />}
            title="V tomto období nemáte žádné plánované výdaje"
            description="Přidejte třeba servis auta nebo dárek. ANITKA je zohlední v predikci konce období."
            action={
              <Button onClick={() => setEditing('new')}>
                <Plus aria-hidden="true" /> Přidat plánovaný výdaj
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {state.plannedExpenses.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="break-words text-sm font-medium">{entry.note || entry.category}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-secondary">
                    {entry.status === 'paid' ? <Check className="size-3.5" aria-hidden="true" /> : <CircleDashed className="size-3.5" aria-hidden="true" />}
                    {entry.status === 'paid' ? 'Zaplaceno' : `Plánováno na ${shortDate(entry.date)}`}
                    {entry.status === 'planned' && entry.date < today ? ' (po termínu)' : ''}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums">{money(entry.amount)}</p>
                {entry.status === 'planned' && (
                  <div className="flex items-center gap-2">
                    {canPay && (
                      <Button variant="secondary" className="min-h-10" onClick={() => void pay(entry.id)} disabled={paying === entry.id}>
                        {paying === entry.id ? 'Ukládám…' : 'Zaplaceno'}
                      </Button>
                    )}
                    <Button variant="ghost" className="min-h-10" onClick={() => setEditing(entry)} aria-label={`Upravit plánovaný výdaj ${entry.note || entry.category}`}>
                      <Pencil aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {payError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {payError}
          </p>
        )}
      </div>

      {editing && (
        <PlannedExpenseModal
          today={today}
          plannedExpense={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            if (editing === 'new') await state.add(values)
            else await state.update(editing.id, values)
            setEditing(null)
          }}
          onDelete={
            editing === 'new'
              ? undefined
              : async () => {
                  await state.remove(editing.id)
                  setEditing(null)
                }
          }
        />
      )}
    </Panel>
  )
}
