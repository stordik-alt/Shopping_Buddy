import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { EXPENSE_CATEGORY_NAMES, subcategoriesOf, type ExpenseCategory } from '@/lib/expense-categories'
import { INTERVAL_LABELS, RECURRING_INTERVALS, type RecurringInterval, type RecurringPayment, type RecurringPaymentInput } from '@/lib/recurring-payments'

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
  const nameRef = useRef<HTMLInputElement>(null)

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
    const value = Number(amount.replace(/[\s ]/g, '').replace(',', '.'))
    if (!name.trim()) return setError('Zadejte název platby.')
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) return setError('Zadejte částku větší než 0.')
    void run(() => onSave({ name, amount: value, category, subcategory: subcategory || null, intervalMonths, startDate }))
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={payment ? 'Upravit pravidelnou platbu' : 'Nová pravidelná platba'}
      initialFocus={payment ? undefined : nameRef}
      footer={
        <>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={save} disabled={busy}>
            {busy ? 'Ukládám…' : payment ? 'Uložit změny' : 'Přidat platbu'}
          </Button>
          {payment && onStop && (
            <Button variant="destructive" size="lg" className="h-auto w-full whitespace-normal py-2" onClick={() => (confirmStop ? void run(onStop) : setConfirmStop(true))} disabled={busy}>
              {confirmStop ? 'Opravdu zastavit? Klepněte znovu' : 'Zastavit platbu (zaplacené zůstanou ve výdajích)'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Název">{(p) => <Input {...p} ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} placeholder="Např. nájem, záloha na elektřinu" />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Částka">{(p) => <Input {...p} value={amount} onChange={(event) => setAmount(event.target.value)} type="text" inputMode="decimal" placeholder="0,00 Kč" />}</Field>
          <Field label="Jak často">
            {(p) => (
              <Select {...p} value={intervalMonths} onChange={(event) => setIntervalMonths(Number(event.target.value) as RecurringInterval)}>
                {RECURRING_INTERVALS.map((option) => (
                  <option key={option} value={option}>
                    {INTERVAL_LABELS[option]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
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
        <Field label="První splatnost" hint="Den v měsíci zůstane stejný pro další splatnosti.">
          {(p) => <Input {...p} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />}
        </Field>
      </div>
    </Sheet>
  )
}
