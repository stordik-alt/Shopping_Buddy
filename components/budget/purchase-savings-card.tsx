'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { AlertTriangle, Loader2, PiggyBank } from 'lucide-react'
import { refreshPurchaseSavingsAction } from '@/app/actions/refresh'
import { monthLabel, money } from '@/lib/format'
import type { PurchaseSavingsByMonth } from '@/lib/purchase-savings'
import type { PurchaseRecord } from '@/lib/types'

export function PurchaseSavingsCard({ today, purchases }: { today: string; purchases: PurchaseRecord[] }) {
  const currentMonth = today.slice(0, 7)
  const [rows, setRows] = useState<PurchaseSavingsByMonth[]>([])
  const [month, setMonth] = useState(currentMonth)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retry, setRetry] = useState(0)
  const [, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    startTransition(async () => {
      try {
        const result = await refreshPurchaseSavingsAction()
        if (!cancelled) {
          setRows(result)
          setStatus('ready')
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    })
    return () => {
      cancelled = true
    }
  }, [purchases, retry, startTransition])

  const months = useMemo(() => [...new Set([currentMonth, ...rows.map((row) => row.month)])].sort().reverse(), [currentMonth, rows])
  const selected = rows.find((row) => row.month === month)

  useEffect(() => {
    if (!months.includes(month)) setMonth(currentMonth)
  }, [currentMonth, month, months])

  return (
    <section className="surface min-w-0 p-5 sm:p-6" aria-labelledby="purchase-savings-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="purchase-savings-title" className="text-base font-semibold">Ušetřeno nákupy</h3>
          <p className="mt-1 text-sm text-fg-secondary">Slevy z uskutečněných nákupů.</p>
        </div>
        <label className="sr-only" htmlFor="purchase-savings-month">Období úspor</label>
        <select
          id="purchase-savings-month"
          aria-label="Období úspor"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="min-h-10 max-w-full rounded-xl border border-input bg-background px-3 text-sm font-medium capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {months.map((option) => <option key={option} value={option}>{monthLabel(option)}</option>)}
        </select>
      </div>

      {status === 'loading' ? (
        <p className="mt-5 flex min-h-24 items-center justify-center gap-2 rounded-2xl bg-muted text-sm text-fg-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Načítám zaznamenané úspory…
        </p>
      ) : status === 'error' ? (
        <div role="alert" className="mt-5 rounded-2xl bg-muted px-4 py-5 text-sm">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 text-destructive" aria-hidden="true" /> Úspory se nepodařilo načíst.</p>
          <button type="button" onClick={() => setRetry((current) => current + 1)} className="mt-2 min-h-10 rounded-lg px-2 font-medium text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Zkusit znovu
          </button>
        </div>
      ) : selected ? (
        <div className="mt-5 rounded-2xl bg-accent-subtle p-4 sm:p-5">
          <p className="text-sm font-medium text-fg-secondary">Podle účtenek</p>
          <p className="mt-1 break-words text-3xl font-semibold tracking-tight text-accent-text">{money(selected.receiptReported)}</p>
          <p className="mt-1 text-xs text-fg-secondary">Součet slev zaznamenaných u nákupů s účtenkou.</p>
          {selected.declared > 0 && (
            <div className="mt-4 border-t border-border/70 pt-3">
              <p className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-fg-secondary">Deklarovaná úspora</span>
                <span className="shrink-0 font-semibold">{money(selected.declared)}</span>
              </p>
              <p className="mt-1 text-xs text-fg-muted">Ručně zadaná sleva bez ověření na účtence.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 flex min-h-28 flex-col items-center justify-center rounded-2xl bg-muted px-4 py-5 text-center">
          <PiggyBank className="size-5 text-fg-muted" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium">Za toto období tu zatím nejsou zaznamenané úspory.</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-fg-secondary">Zobrazí se sleva uvedená na účtence nebo zvlášť označená ručně zadaná sleva. Nabídky z letáků se jako skutečná úspora nepočítají.</p>
        </div>
      )}
    </section>
  )
}
