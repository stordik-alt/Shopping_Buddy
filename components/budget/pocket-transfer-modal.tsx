import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { money } from '@/lib/format'
import type { Pocket } from '@/lib/types'

/** A real move of money between the budget and a Kapsa (docs/15_BUDGET_PERIODS.md §11.1, §14): only
 *  what the user confirms here is moved. `max` is what the server will allow, shown so the user is not
 *  surprised by a refusal; the server checks it again. */
export function PocketTransferModal({
  pocket,
  direction,
  max,
  onClose,
  onSubmit,
}: {
  pocket: Pocket
  /** 'in' = Rozpočet → Kapsa, 'out' = Kapsa → Rozpočet. */
  direction: 'in' | 'out'
  max: number
  onClose: () => void
  onSubmit: (amount: number) => Promise<void>
}) {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)
  const into = direction === 'in'

  async function submit() {
    const value = Number(amount.replace(/[\s ]/g, '').replace(',', '.'))
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) return setError('Zadejte částku větší než 0.')
    if (value > max) return setError(`Nejvýše ${money(max)}.`)
    setBusy(true)
    setError('')
    try {
      await onSubmit(value)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Převod se nepodařilo provést.')
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={into ? `Uložit do Kapsy ${pocket.name}` : `Vzít z Kapsy ${pocket.name}`}
      description={into ? 'Peníze se přesunou z rozpočtu tohoto období do Kapsy.' : 'Peníze se vrátí z Kapsy do rozpočtu tohoto období.'}
      initialFocus={amountRef}
      footer={
        <>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={() => void submit()} disabled={busy || max <= 0}>
            {busy ? 'Převádím…' : into ? 'Uložit do Kapsy' : 'Vzít z Kapsy'}
          </Button>
        </>
      }
    >
      <Field label="Částka" hint={max > 0 ? `Nejvýše ${money(max)}` : into ? 'V rozpočtu teď nejsou žádné volné peníze.' : 'Kapsa je prázdná.'}>
        {(p) => <Input {...p} ref={amountRef} value={amount} onChange={(event) => setAmount(event.target.value)} type="text" inputMode="decimal" placeholder="0,00 Kč" />}
      </Field>
    </Sheet>
  )
}
