import { useState } from 'react'
import { X } from 'lucide-react'
import { EXPENSE_CATEGORY_NAMES, subcategoriesOf, type ExpenseCategory } from '@/lib/expense-categories'
import { INTERVAL_LABELS, RECURRING_INTERVALS, type RecurringInterval, type RecurringPayment, type RecurringPaymentInput } from '@/lib/recurring-payments'

const FIELD = 'mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Adds a recurring payment, or — given `payment` — changes or stops one. The server checks it all
 *  again (lib/recurring-payments.ts validateRecurringPaymentInput). */
export function RecurringPaymentModal({
  today,
  payment,
  onClose,
  onSave,
  onStop,
}: {
  today: string
  payment?: RecurringPayment
  onClose: () => void
  onSave: (input: RecurringPaymentInput) => Promise<void>
  onStop?: () => Promise<void>
}) {
  const [name, setName] = useState(payment?.name ?? '')
  const [amount, setAmount] = useState(payment ? String(payment.amount).replace('.', ',') : '')
  const [category, setCategory] = useState<ExpenseCategory>(payment?.category ?? 'Bydlení')
  const [subcategory, setSubcategory] = useState(payment?.subcategory ?? '')
  const [intervalMonths, setIntervalMonths] = useState<RecurringInterval>(payment?.intervalMonths ?? 1)
  const [startDate, setStartDate] = useState(payment?.startDate ?? today)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmStop, setConfirmStop] = useState(false)

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Platbu se nepodařilo uložit.')
    } finally {
      setBusy(false)
    }
  }

  function save() {
    const value = Number(amount.replace(/[\s ]/g, '').replace(',', '.'))
    if (!name.trim()) return setError('Zadejte název platby.')
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) return setError('Zadejte částku větší než 0.')
    void run(() => onSave({ name, amount: value, category, subcategory: subcategory || null, intervalMonths, startDate }))
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="min-w-0 text-lg font-semibold">{payment ? 'Upravit pravidelnou platbu' : 'Nová pravidelná platba'}</h2>
          <button onClick={onClose} aria-label="Zavřít" className="icon-button shrink-0">
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-sm">
            Název
            <input autoFocus={!payment} value={name} onChange={(event) => setName(event.target.value)} placeholder="Např. nájem, záloha na elektřinu" className={FIELD} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              Částka
              <input value={amount} onChange={(event) => setAmount(event.target.value)} type="text" inputMode="decimal" placeholder="0,00 Kč" className={FIELD} />
            </label>
            <label className="block text-sm">
              Jak často
              <select value={intervalMonths} onChange={(event) => setIntervalMonths(Number(event.target.value) as RecurringInterval)} className={FIELD}>
                {RECURRING_INTERVALS.map((option) => (
                  <option key={option} value={option}>
                    {INTERVAL_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>
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
            První splatnost
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={FIELD} />
            <span className="mt-1 block text-xs text-muted-foreground">Den v měsíci zůstane stejný pro další splatnosti.</span>
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
            {busy ? 'Ukládám…' : payment ? 'Uložit změny' : 'Přidat platbu'}
          </button>
          {payment && onStop && (
            <button
              onClick={() => (confirmStop ? void run(onStop) : setConfirmStop(true))}
              disabled={busy}
              className="min-h-11 w-full rounded-xl border border-destructive/40 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {confirmStop ? 'Opravdu zastavit? Klepněte znovu' : 'Zastavit platbu (zaplacené zůstanou ve výdajích)'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
