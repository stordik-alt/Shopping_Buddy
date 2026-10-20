'use client'

import { useState } from 'react'
import type { RecurringIncome, RecurringIncomeInput } from '@/lib/recurring-incomes'
import { RECURRING_INCOME_INTERVALS, RECURRING_INCOME_INTERVAL_LABELS } from '@/lib/recurring-incomes'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'

export function RecurringIncomeModal({
  today,
  income,
  onClose,
  onSave,
}: {
  today: string
  income?: RecurringIncome
  onClose: () => void
  onSave: (input: RecurringIncomeInput) => Promise<void>
}) {
  const [description, setDescription] = useState(income?.description ?? '')
  const [amount, setAmount] = useState(income ? String(income.expectedAmount).replace('.', ',') : '')
  const [intervalMonths, setIntervalMonths] = useState(String(income?.intervalMonths ?? 1))
  const [startDate, setStartDate] = useState(income?.startDate ?? today)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const expectedAmount = Number(amount.replace(/[\\s ]/g, '').replace(',', '.'))
    if (!description.trim()) return setError('Zadejte popis pravidelného příjmu.')
    if (!amount.trim() || !Number.isFinite(expectedAmount) || expectedAmount <= 0) return setError('Zadejte očekávanou částku větší než 0.')
    if (!startDate) return setError('Zadejte první očekávané datum.')
    setBusy(true)
    setError('')
    try {
      await onSave({ description, expectedAmount, intervalMonths: Number(intervalMonths), startDate })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pravidelný příjem se nepodařilo uložit.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={income ? 'Upravit pravidelný příjem' : 'Nový pravidelný příjem'}
      footer={
        <>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button size="lg" className="w-full" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Ukládám…' : income ? 'Uložit změny' : 'Přidat pravidelný příjem'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Popis">{(props) => <Input {...props} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Např. výplata, příspěvek na bydlení" />}</Field>
        <Field label="Očekávaná částka">{(props) => <Input {...props} value={amount} onChange={(event) => setAmount(event.target.value)} type="text" inputMode="decimal" placeholder="30 000 Kč" />}</Field>
        <Field label="Četnost">
          {(props) => (
            <Select {...props} value={intervalMonths} onChange={(event) => setIntervalMonths(event.target.value)}>
              {RECURRING_INCOME_INTERVALS.map((interval) => <option key={interval} value={interval}>{RECURRING_INCOME_INTERVAL_LABELS[interval]}</option>)}
            </Select>
          )}
        </Field>
        <Field label="První očekávané datum">{(props) => <Input {...props} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />}</Field>
        <p className="text-xs text-fg-secondary">Částka je pouze odhad pro plánování. Při každém přijetí potvrdíte skutečně přijatou částku. Změna očekávané částky nepřepíše již zaznamenané příjmy.</p>
      </div>
    </Sheet>
  )
}
