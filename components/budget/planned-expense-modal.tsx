import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { EXPENSE_CATEGORY_NAMES } from '@/lib/expense-categories'
import type { PlannedExpenseInput } from '@/lib/planned-expense-input'
import type { PlannedExpense } from '@/lib/types'

/** Adds a planned expense, or — given `plannedExpense` — changes or removes one. A plan is only
 *  expected money going out; it never changes the actual balance until it is paid. The server checks it
 *  all again (lib/planned-expense-input.ts). */
export function PlannedExpenseModal({
  today,
  plannedExpense,
  onClose,
  onSave,
  onDelete,
}: {
  today: string
  plannedExpense?: PlannedExpense
  onClose: () => void
  onSave: (values: PlannedExpenseInput) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [note, setNote] = useState(plannedExpense?.note ?? '')
  const [amount, setAmount] = useState(plannedExpense ? String(plannedExpense.amount).replace('.', ',') : '')
  const [category, setCategory] = useState<string>(plannedExpense?.category ?? 'Ostatní')
  const [date, setDate] = useState(plannedExpense?.date ?? today)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const noteRef = useRef<HTMLInputElement>(null)

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plánovaný výdaj se nepodařilo uložit.')
    } finally {
      setBusy(false)
    }
  }

  function save() {
    const value = Number(amount.replace(/[\s ]/g, '').replace(',', '.'))
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) return setError('Zadejte částku větší než 0.')
    if (!date) return setError('Zadejte datum.')
    void run(() => onSave({ amount: value, note, category, date }))
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={plannedExpense ? 'Upravit plánovaný výdaj' : 'Nový plánovaný výdaj'}
      description="Očekávaný výdaj. Do skutečného zůstatku se započítá, až ho označíte jako zaplacený."
      initialFocus={plannedExpense ? undefined : noteRef}
      footer={
        <>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={save} disabled={busy}>
            {busy ? 'Ukládám…' : plannedExpense ? 'Uložit změny' : 'Přidat plánovaný výdaj'}
          </Button>
          {plannedExpense && onDelete && (
            <Button variant="destructive" size="lg" className="w-full" onClick={() => (confirmDelete ? void run(onDelete) : setConfirmDelete(true))} disabled={busy}>
              {confirmDelete ? 'Opravdu smazat? Klepněte znovu' : 'Smazat plánovaný výdaj'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Popis">{(p) => <Input {...p} ref={noteRef} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Např. servis auta, dárek" />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Částka">{(p) => <Input {...p} value={amount} onChange={(event) => setAmount(event.target.value)} type="text" inputMode="decimal" placeholder="0,00 Kč" />}</Field>
          <Field label="Očekáváno dne">{(p) => <Input {...p} type="date" value={date} onChange={(event) => setDate(event.target.value)} />}</Field>
        </div>
        <Field label="Kategorie">
          {(p) => (
            <Select {...p} value={category} onChange={(event) => setCategory(event.target.value)}>
              {EXPENSE_CATEGORY_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Sheet>
  )
}
