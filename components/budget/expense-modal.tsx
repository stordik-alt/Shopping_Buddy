import { useRef, useState } from 'react'
import { Receipt, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { longDate, money } from '@/lib/format'
import { EXPENSE_CATEGORY_NAMES, subcategoriesOf, type ExpenseCategory } from '@/lib/expense-categories'
import type { ExpenseInput } from '@/lib/expense-input'
import type { Expense } from '@/lib/types'

/** Adds an expense, or — given `expense` — corrects or deletes one. The server checks everything
 *  again (lib/expense-input.ts); a message it refuses with is shown here as it is. */
export function ExpenseModal({
  today,
  expense,
  onClose,
  onSave,
  onDelete,
}: {
  /** The real date (`YYYY-MM-DD`): the default date, and the latest one allowed. */
  today: string
  /** The expense being corrected; absent for a new one. */
  expense?: Expense
  onClose: () => void
  onSave: (input: ExpenseInput) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [amount, setAmount] = useState(expense ? String(expense.amount).replace('.', ',') : '')
  const [note, setNote] = useState(expense?.note ?? '')
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'Potraviny')
  const [subcategory, setSubcategory] = useState(expense?.subcategory ?? '')
  const [date, setDate] = useState(expense?.date ?? today)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Výdaj se nepodařilo uložit.')
    } finally {
      setBusy(false)
    }
  }

  function save() {
    // "1 250,50" or "1250.5"; the server rounds to haléře and checks the amount again.
    const value = Number(amount.replace(/[\s ]/g, '').replace(',', '.'))
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) {
      setError('Zadejte částku větší než 0.')
      return
    }
    if (!date || date > today) {
      setError('Datum výdaje nemůže být v budoucnosti.')
      return
    }
    void run(() => onSave({ amount: value, note: note.trim() || subcategory || category, category, subcategory: subcategory || null, date }))
  }

  // A receipt's expense is what the receipt says was paid (lib/purchase-expenses.ts); the server
  // refuses to change it by hand, so it is shown, not edited.
  if (expense?.purchaseId) {
    return (
      <Sheet open onClose={onClose} title="Výdaj z účtenky">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-fg-muted">Částka</dt><dd className="font-semibold">{money(expense.amount)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-fg-muted">Kategorie</dt><dd className="text-right break-words">{expense.category}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-fg-muted">Datum</dt><dd className="text-right">{longDate(expense.date)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-fg-muted">Poznámka</dt><dd className="text-right break-words">{expense.note}</dd></div>
        </dl>
        <p className="mt-5 flex gap-2 rounded-2xl bg-muted p-3 text-sm text-fg-secondary">
          <Receipt className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Částku zapsala nahraná účtenka, rozdělenou podle kategorií položek. Mění se jen s nákupem, ne ručně.
        </p>
      </Sheet>
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={expense ? 'Upravit výdaj' : 'Nový výdaj'}
      initialFocus={expense ? undefined : amountRef}
      footer={
        <>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={save} disabled={busy}>
            {busy ? 'Ukládám…' : expense ? 'Uložit změny' : 'Uložit výdaj'}
          </Button>
          {expense && onDelete && (
            <Button variant="destructive" size="lg" className="w-full" onClick={() => (confirmDelete ? void run(onDelete) : setConfirmDelete(true))} disabled={busy}>
              <Trash2 aria-hidden="true" />
              {confirmDelete ? 'Opravdu smazat? Klepněte znovu' : 'Smazat výdaj'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Částka">{(p) => <Input {...p} ref={amountRef} value={amount} onChange={(event) => setAmount(event.target.value)} type="text" inputMode="decimal" placeholder="0,00 Kč" />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kategorie">
            {(p) => (
              <Select
                {...p}
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as ExpenseCategory)
                  setSubcategory('')
                }}
              >
                {EXPENSE_CATEGORY_NAMES.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Podkategorie">
            {(p) => (
              <Select {...p} value={subcategory} onChange={(event) => setSubcategory(event.target.value)}>
                <option value="">Bez podkategorie</option>
                {subcategoriesOf(category).map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Datum platby">{(p) => <Input {...p} type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} />}</Field>
        <Field label="Poznámka">{(p) => <Input {...p} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Např. záloha na elektřinu" />}</Field>
      </div>
    </Sheet>
  )
}
