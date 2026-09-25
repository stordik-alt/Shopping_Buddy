'use client'

import { useState } from 'react'
import { ChevronDown, Plus, RotateCcw } from 'lucide-react'
import { userFacingError } from '@/lib/errors'
import type { UsualItem } from '@/lib/usual-items'

// "Doplnit obvyklé": what the household usually buys and is due again (lib/usual-items.ts). Shown
// only when there is something to suggest, collapsed by default so it never pushes the list down.
// Adding goes through the same action as typing the item, one item at a time.

function intervalLabel(intervalDays: number): string {
  const days = Math.max(1, Math.round(intervalDays))
  if (days === 1) return 'kupujete zhruba každý den'
  if (days < 5) return `kupujete zhruba každé ${days} dny`
  return `kupujete zhruba každých ${days} dní`
}

function lastBoughtLabel(days: number): string {
  if (days === 0) return 'naposledy dnes'
  if (days === 1) return 'naposledy včera'
  return `naposledy před ${days} dny`
}

export function UsualItems({ suggestions, onAdd }: { suggestions: UsualItem[]; onAdd: (items: UsualItem[]) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (suggestions.length === 0) return null

  async function add(items: UsualItem[], key: string) {
    setBusy(key)
    setError(null)
    try {
      await onAdd(items)
    } catch (err) {
      setError(userFacingError(err, 'Položky se nepodařilo přidat. Zkuste to prosím znovu.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="surface p-4" aria-label="Obvyklé nákupy">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-center gap-2">
          <RotateCcw className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Doplnit obvyklé</span>
            <span className="block text-xs text-muted-foreground">
              {suggestions.length === 1 ? '1 položka je na řadě' : suggestions.length < 5 ? `${suggestions.length} položky jsou na řadě` : `${suggestions.length} položek je na řadě`}
            </span>
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <ul className="divide-y divide-border">
            {suggestions.map((item) => (
              <li key={item.name} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} {item.unit} · {intervalLabel(item.intervalDays)}, {lastBoughtLabel(item.daysSinceLast)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void add([item], item.name)}
                  aria-label={`Přidat ${item.name} na seznam`}
                  className="flex min-h-10 shrink-0 items-center gap-1 rounded-xl border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {busy === item.name ? 'Přidávám…' : 'Přidat'}
                </button>
              </li>
            ))}
          </ul>
          {suggestions.length > 1 && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void add(suggestions, '*')}
              className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> {busy === '*' ? 'Přidávám…' : 'Přidat vše na seznam'}
            </button>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
