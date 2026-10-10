import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import type { Income, IncomeStatus } from '@/lib/types'

export type IncomeFormValues = { amount: number; description: string; date: string; status: IncomeStatus }

/** Adds an income (planned or already received), or — given `income` — changes or removes one. Only a
 *  new income chooses its status; an existing one becomes received through its own button, so it is
 *  never counted twice. The server checks it all again (lib/income-input.ts). */
export function IncomeModal({
  today,
  income,
  onClose,
  onSave,
  onDelete,
}: {
  today: string
  income?: Income
  onClose: () => void
  onSave: (values: IncomeFormValues) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [description, setDescription] = useState(income?.description ?? '')
  const [amount, setAmount] = useState(income ? String(income.amount).replace('.', ',') : '')
  const [status, setStatus] = useState<IncomeStatus>(income?.status ?? 'planned')
  const [date, setDate] = useState(income?.date ?? today)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const descriptionRef = useRef<HTMLInputElement>(null)

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Příjem se nepodařilo uložit.')
    } finally {
      setBusy(false)
    }
  }

  function save() {
    const value = Number(amount.replace(/[\s ]/g, '').replace(',', '.'))
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) return setError('Zadejte částku větší než 0.')
    if (!date) return setError('Zadejte datum.')
    void run(() => onSave({ amount: value, description, date, status }))
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={income ? 'Upravit příjem' : 'Nový příjem'}
      initialFocus={income ? undefined : descriptionRef}
      footer={
        <>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={save} disabled={busy}>
            {busy ? 'Ukládám…' : income ? 'Uložit změny' : 'Přidat příjem'}
          </Button>
          {income && onDelete && (
            <Button variant="destructive" size="lg" className="w-full" onClick={() => (confirmDelete ? void run(onDelete) : setConfirmDelete(true))} disabled={busy}>
              {confirmDelete ? 'Opravdu smazat? Klepněte znovu' : 'Smazat příjem'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Popis">{(p) => <Input {...p} ref={descriptionRef} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Např. výplata, brigáda" />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Částka">{(p) => <Input {...p} value={amount} onChange={(event) => setAmount(event.target.value)} type="text" inputMode="decimal" placeholder="0,00 Kč" />}</Field>
          <Field label={status === 'actual' ? 'Přijato dne' : 'Očekáváno dne'}>{(p) => <Input {...p} type="date" value={date} onChange={(event) => setDate(event.target.value)} />}</Field>
        </div>
        {!income && (
          <Field label="Stav" hint="Plánovaný příjem se do skutečného zůstatku započítá, až ho označíte jako přijatý.">
            {(p) => (
              <Select {...p} value={status} onChange={(event) => setStatus(event.target.value as IncomeStatus)}>
                <option value="planned">Plánovaný (ještě nepřišel)</option>
                <option value="actual">Přijatý (už je na účtu)</option>
              </Select>
            )}
          </Field>
        )}
      </div>
    </Sheet>
  )
}
