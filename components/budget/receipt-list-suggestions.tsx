import { useState } from 'react'
import { Check, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-accent-text">
          <ListChecks className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Odškrtnout na nákupním seznamu?</p>
          <p className="text-sm text-fg-secondary">Tyto položky ze seznamu vypadají jako nakoupené. Doplníme jim cenu a množství z účtenky.</p>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {suggestions.map((suggestion) => (
          <li key={suggestion.listItemId}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted/50 has-[:checked]:border-accent-solid has-[:checked]:bg-accent-subtle/50">
              <input
                type="checkbox"
                checked={selected.has(suggestion.listItemId)}
                onChange={() => toggle(suggestion.listItemId)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--accent-solid)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block break-words font-medium">{suggestion.listItemName}</span>
                <span className="block break-words text-xs text-fg-muted">
                  na účtence: {suggestion.receiptName} · {suggestion.quantity} {suggestion.unit} · {money(suggestion.price)} / {suggestion.unit}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="lg" onClick={confirm} disabled={saving || selected.size === 0}>
          <Check aria-hidden="true" /> {saving ? 'Ukládám…' : `Odškrtnout (${selected.size})`}
        </Button>
        <Button variant="outline" size="lg" onClick={onDismiss} disabled={saving}>
          Ponechat na seznamu
        </Button>
      </div>
    </div>
  )
}
