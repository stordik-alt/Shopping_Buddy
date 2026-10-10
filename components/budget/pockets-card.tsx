import { useState } from 'react'
import { Loader2, PiggyBank, Plus } from 'lucide-react'
import { Panel } from '@/components/budget/panel'
import { PocketIcon } from '@/components/budget/pocket-icon'
import { PocketModal } from '@/components/budget/pocket-modal'
import { PocketTransferModal } from '@/components/budget/pocket-transfer-modal'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { maxDeposit, pocketProgress } from '@/lib/budget-closing'
import { money, shortDate } from '@/lib/format'
import type { useBudgetLedger } from '@/components/shell/use-budget-ledger'
import type { Pocket } from '@/lib/types'

type LedgerState = ReturnType<typeof useBudgetLedger>

/** Rozpočet → Plánování → Kapsy (docs/15_BUDGET_PERIODS.md §10–11). Shows what is really in each Kapsa
 *  and, separately, what is only planned or recommended; money moves only when the user confirms a
 *  transfer. `available` is the budget's actual balance, which caps how much can be saved. */
export function PocketsCard({ ledger, available }: { ledger: LedgerState; available: number }) {
  const [editing, setEditing] = useState<'new' | Pocket | null>(null)
  const [transfer, setTransfer] = useState<{ pocket: Pocket; direction: 'in' | 'out' } | null>(null)

  const list = ledger.ledger?.pockets ?? null
  const summary = list === null ? undefined : list.length === 0 ? 'Zatím žádná Kapsa' : `${list.length} ${list.length === 1 ? 'Kapsa' : list.length < 5 ? 'Kapsy' : 'Kapes'} · celkem ${money(list.reduce((sum, pocket) => sum + pocket.balance, 0))}`

  return (
    <Panel
      title="Kapsy"
      summary={summary}
      description="Peníze odložené na účel. Plán nic nepřesouvá, dokud peníze sami nepřevedete."
      action={
        <Button variant="secondary" onClick={() => setEditing('new')}>
          <Plus aria-hidden="true" /> Přidat Kapsu
        </Button>
      }
    >
      <div>
        {ledger.error ? (
          <div role="alert" className="space-y-3 rounded-2xl bg-muted p-4 text-sm">
            <p>{ledger.error}</p>
            <Button variant="secondary" onClick={ledger.retry}>
              Zkusit znovu
            </Button>
          </div>
        ) : ledger.ledger === null ? (
          <p className="flex items-center gap-2 text-sm text-fg-secondary">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Načítám…
          </p>
        ) : ledger.ledger.pockets.length === 0 ? (
          <EmptyState
            icon={<PiggyBank />}
            title="Zatím nemáte žádnou Kapsu"
            description="Založte si Kapsu třeba na finanční rezervu, auto nebo dovolenou a odkládejte do ní peníze."
            action={
              <Button onClick={() => setEditing('new')}>
                <Plus aria-hidden="true" /> Přidat Kapsu
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {ledger.ledger.pockets.map((pocket) => (
              <PocketRow key={pocket.id} pocket={pocket} onEdit={() => setEditing(pocket)} onTransfer={(direction) => setTransfer({ pocket, direction })} />
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <PocketModal
          pocket={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            if (editing === 'new') await ledger.addPocket(input)
            else await ledger.updatePocket(editing.id, input)
            setEditing(null)
          }}
          onArchive={
            editing === 'new'
              ? undefined
              : async () => {
                  await ledger.archivePocket(editing.id)
                  setEditing(null)
                }
          }
        />
      )}
      {transfer && (
        <PocketTransferModal
          pocket={transfer.pocket}
          direction={transfer.direction}
          max={transfer.direction === 'in' ? maxDeposit(available) : transfer.pocket.balance}
          onClose={() => setTransfer(null)}
          onSubmit={(amount) => (transfer.direction === 'in' ? ledger.saveToPocket(transfer.pocket.id, amount) : ledger.takeFromPocket(transfer.pocket.id, amount))}
        />
      )}
    </Panel>
  )
}

function PocketRow({ pocket, onEdit, onTransfer }: { pocket: Pocket; onEdit: () => void; onTransfer: (direction: 'in' | 'out') => void }) {
  const progress = pocketProgress(pocket.balance, pocket.targetAmount)
  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center gap-3">
        <PocketIcon name={pocket.icon} className="size-5 shrink-0 text-fg-secondary" />
        <button type="button" onClick={onEdit} className="min-h-10 min-w-0 flex-1 text-left" aria-label={`Upravit Kapsu ${pocket.name}`}>
          <span className="block break-words text-sm font-medium">{pocket.name}</span>
          {pocket.targetAmount !== null && pocket.targetDate && (
            <span className="block text-xs text-fg-secondary">
              Cíl {money(pocket.targetAmount)} do {shortDate(pocket.targetDate)}
            </span>
          )}
        </button>
        <p className="text-sm font-semibold tabular-nums">{money(pocket.balance)}</p>
      </div>
      {progress !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={`Splněno z cíle Kapsy ${pocket.name}`}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {(pocket.recommended !== null || pocket.plannedContribution !== null) && (
        <p className="text-xs text-fg-secondary">
          {pocket.plannedContribution !== null && <>Plánujete ukládat {money(pocket.plannedContribution)} za období. </>}
          {pocket.recommended !== null && pocket.recommended > 0 && <>K cíli doporučujeme {money(pocket.recommended)} za období.</>}
          {pocket.recommended === 0 && <>Cíl je splněný.</>}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" className="min-h-10 flex-1" onClick={() => onTransfer('in')}>
          Uložit
        </Button>
        <Button variant="secondary" className="min-h-10 flex-1" onClick={() => onTransfer('out')} disabled={pocket.balance <= 0}>
          Vzít
        </Button>
      </div>
    </li>
  )
}
