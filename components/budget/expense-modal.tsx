import { useState } from 'react'
import { Receipt, Trash2, X } from 'lucide-react'
import { longDate, money } from '@/lib/format'
import { EXPENSE_CATEGORY_NAMES, subcategoriesOf, type ExpenseCategory } from '@/lib/expense-categories'
import type { ExpenseInput } from '@/lib/expense-input'
import type { Expense } from '@/lib/types'

const FIELD = 'mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring'

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
    const value = Number(amount.replace(/[\s\u00a0]/g, '').replace(',', '.'))
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
      <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
        <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="min-w-0 text-lg font-semibold">Výdaj z účtenky</h2>
            <button onClick={onClose} aria-label="Zavřít" className="icon-button shrink-0">
              <X aria-hidden="true" />
            </button>
          </div>
          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Částka</dt><dd className="font-semibold">{money(expense.amount)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Kategorie</dt><dd className="text-right break-words">{expense.category}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Datum</dt><dd className="text-right">{longDate(expense.date)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Poznámka</dt><dd className="text-right break-words">{expense.note}</dd></div>
          </dl>
          <p className="mt-5 flex gap-2 rounded-2xl bg-muted p-3 text-sm text-muted-foreground">
            <Receipt className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Částku zapsala nahraná účtenka, rozdělenou podle kategorií položek. Mění se jen s nákupem, ne ručně.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="min-w-0 text-lg font-semibold">{expense ? 'Upravit výdaj' : 'Nový výdaj'}</h2>
          <button onClick={onClose} aria-label="Zavřít" className="icon-button shrink-0">
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-sm">
            Částka
            <input
              autoFocus={!expense}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              type="text"
              inputMode="decimal"
              placeholder="0,00 Kč"
              className={FIELD}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              Kategorie
              <select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as ExpenseCategory)
                  setSubcategory('')
                }}
                className={FIELD}
              >
                {EXPENSE_CATEGORY_NAMES.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Podkategorie
              <select value={subcategory} onChange={(event) => setSubcategory(event.target.value)} className={FIELD}>
                <option value="">Bez podkategorie</option>
                {subcategoriesOf(category).map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            Datum platby
            <input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} className={FIELD} />
          </label>
          <label className="block text-sm">
            Poznámka
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Např. záloha na elektřinu" className={FIELD} />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            onClick={save}
            disabled={busy}
            className="min-h-11 w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {busy ? 'Ukládám…' : expense ? 'Uložit změny' : 'Uložit výdaj'}
          </button>
          {expense && onDelete && (
            <button
              onClick={() => (confirmDelete ? void run(onDelete) : setConfirmDelete(true))}
              disabled={busy}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-destructive/40 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {confirmDelete ? 'Opravdu smazat? Klepněte znovu' : 'Smazat výdaj'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
