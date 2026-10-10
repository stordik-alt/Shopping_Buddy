import { useState } from 'react'
import { Panel } from '@/components/budget/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import type { OutlookPeriod } from '@/lib/budget-outlook'
import { money } from '@/lib/format'

/** "1 500,50" → 1500.5; null for blank; NaN for text that is not a number. */
function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[\s ]/g, '').replace(',', '.')
  return cleaned === '' ? null : Number(cleaned)
}

/** Rozpočet → Plánování → Plánovaný převod (docs/15_BUDGET_PERIODS.md §14): what to leave for the next
 *  period when this one ends. Only a plan — it moves no money. When the period is closed the real
 *  transfer (never more than what really remains) replaces it and pre-fills the closing. */
export function PlannedCarryCard({
  planned,
  row,
  defaultOpen = false,
  onSave,
}: {
  defaultOpen?: boolean
  /** The saved plan, if any. */
  planned: number | null
  /** The outlook of the period, once loaded: what it is expected to end with. */
  row: OutlookPeriod | null
  onSave: (amount: number | null) => Promise<void>
}) {
  const [text, setText] = useState(planned === null ? '' : String(planned).replace('.', ','))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const amount = parseAmount(text)
  const invalid = amount !== null && (!Number.isFinite(amount) || amount < 0)
  const unchanged = (amount ?? null) === planned || (amount === 0 && planned === null)

  async function save() {
    if (invalid) return
    setBusy(true)
    setError('')
    try {
      await onSave(amount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plán se nepodařilo uložit.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Převod do dalšího období"
      summary={planned === null ? 'Bez plánu' : `Plán: ${money(planned)}`}
      description="Kolik chcete nechat na další období. Je to jen plán: při uzavření se použije skutečný přebytek, nejvýš tolik, kolik opravdu zbyde."
      defaultOpen={defaultOpen}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="w-40 text-right"
          value={text}
          onChange={(event) => setText(event.target.value)}
          type="text"
          inputMode="decimal"
          placeholder="0 Kč"
          aria-label="Plánovaný převod do dalšího období"
          aria-invalid={invalid}
        />
        <Button variant="secondary" className="min-h-11" onClick={() => void save()} disabled={busy || invalid || unchanged}>
          {busy ? 'Ukládám…' : 'Uložit plán'}
        </Button>
      </div>
      {invalid && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          Zadejte částku od 0 Kč výš.
        </p>
      )}
      {row && (
        <p className="mt-3 text-sm text-fg-secondary" aria-live="polite">
          {row.predicted < 0
            ? `Podle výhledu bude chybět ${money(-row.predicted)}; schodek přejde do dalšího období jako záporný převod.`
            : row.carryOut > 0
              ? `Podle výhledu skončí období s ${money(row.predicted)} a převede se ${money(row.carryOut)}.`
              : `Podle výhledu skončí období s ${money(row.predicted)}; nic se nepřevádí.`}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </Panel>
  )
}
