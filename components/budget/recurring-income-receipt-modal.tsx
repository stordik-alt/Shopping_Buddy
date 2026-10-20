'use client'

import { useState } from 'react'
import type { Income } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'

export function RecurringIncomeReceiptModal({
  income,
  today,
  onClose,
  onConfirm,
}: {
  income: Income
  today: string
  onClose: () => void
  onConfirm: (actual: { amount: number; date: string }) => Promise<void>
}) {
  const [amount, setAmount] = useState(String(income.amount).replace('.', ','))
  const [date, setDate] = useState(today)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const value = Number(amount.replace(/[\\s ]/g, '').replace(',', '.'))
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) {
      setError('Zadejte skutečně přijatou částku větší než 0.')
      return
    }
    if (!date || date > today) {
      setError('Zadejte platné datum přijetí, nejpozději dnešek.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onConfirm({ amount: Math.round(value * 100) / 100, date })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Příjem se nepodařilo potvrdit.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Potvrdit skutečně přijatý příjem"
      footer={
        <>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button size="lg" className="w-full" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Ukládám…' : 'Potvrdit skutečnou částku'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-fg-secondary">
          Očekáváno {income.amount.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK' })} dne {income.occurrenceDueDate}. Zadejte částku, která skutečně dorazila; očekávaný plán zůstane oddělený od historie.
        </p>
        <Field label="Skutečně přijatá částka">{(props) => <Input {...props} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" type="text" placeholder="0,00 Kč" />}</Field>
        <Field label="Datum přijetí">{(props) => <Input {...props} value={date} onChange={(event) => setDate(event.target.value)} type="date" max={today} />}</Field>
      </div>
    </Sheet>
  )
}
