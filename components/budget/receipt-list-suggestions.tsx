import { useState } from 'react'
import { Check, ListChecks } from 'lucide-react'
import type { ReceiptListSuggestion } from '@/lib/db/receipt-list'
import { money } from '@/lib/format'
import { userFacingError } from '@/lib/errors'

/** After a receipt is imported, the items on the shopping list that it certainly covers are ticked
 *  automatically. This card lists the *plausible* ones ("Mléko" ↔ "MLEKO POLOTUC. 1L") for the
 *  household to confirm — nothing is guessed. Ticked items take the quantity and price from the
 *  receipt. Wrapping (not sideways scrolling) keeps long product names inside a phone screen. */
export function ReceiptListSuggestions({
  suggestions,
  onConfirm,
  onDismiss,
}: {
  suggestions: ReceiptListSuggestion[]
  onConfirm: (selected: ReceiptListSuggestion[]) => Promise<void>
  onDismiss: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(suggestions.map((s) => s.listItemId)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (suggestions.length === 0) return null

  function toggle(listItemId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(listItemId)) next.delete(listItemId)
      else next.add(listItemId)
      return next
    })
  }

  async function confirm() {
    setSaving(true)
    setError('')
    try {
      await onConfirm(suggestions.filter((s) => selected.has(s.listItemId)))
    } catch (err) {
      setError(userFacingError(err, 'Položky se nepodařilo odškrtnout.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="surface p-5" role="region" aria-label="Odškrtnout nakoupené položky na seznamu">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <ListChecks className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Odškrtnout na nákupním seznamu?</p>
          <p className="text-xs text-muted-foreground">Tyto položky ze seznamu vypadají jako nakoupené. Doplníme jim cenu a množství z účtenky.</p>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {suggestions.map((suggestion) => (
          <li key={suggestion.listItemId}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(suggestion.listItemId)}
                onChange={() => toggle(suggestion.listItemId)}
                className="mt-1 h-4 w-4 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block break-words font-medium">{suggestion.listItemName}</span>
                <span className="block break-words text-xs text-muted-foreground">
                  na účtence: {suggestion.receiptName} · {suggestion.quantity} {suggestion.unit} · {money(suggestion.price)} / {suggestion.unit}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={saving || selected.size === 0}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          <Check className="h-4 w-4" aria-hidden="true" /> {saving ? 'Ukládám…' : `Odškrtnout (${selected.size})`}
        </button>
        <button type="button" onClick={onDismiss} disabled={saving} className="min-h-11 rounded-xl border border-border px-4 text-sm text-muted-foreground hover:bg-muted">
          Ponechat na seznamu
        </button>
      </div>
    </div>
  )
}
