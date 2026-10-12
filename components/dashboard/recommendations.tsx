'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { safeLocalStorage } from '@/lib/safe-storage'

const STORAGE_KEY = 'anitka.recommendations.collapsed'

/** Domů: the cards in which the app recommends something (stocking up, deals on favourites, the price
 *  watch) under one heading that can be folded away. While folded the cards are not even mounted, so the
 *  ones that load their own data (deals on favourites) ask for nothing — the home screen stays light.
 *  The choice is remembered on this device. Until it has been read (after mount) the cards are withheld
 *  too, so a household that folded them never pays for one render of them. */
export function Recommendations({ restockCount, children }: { restockCount: number; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean | null>(null)

  useEffect(() => {
    setCollapsed(safeLocalStorage()?.getItem(STORAGE_KEY) === '1')
  }, [])

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try {
      safeLocalStorage()?.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // The choice simply is not remembered.
    }
  }

  const summary = restockCount > 0 ? `Doplnění zásob: ${restockCount}. Rozbalte pro návrhy a akce.` : 'Rozbalte pro návrhy a akce.'
  return (
    <section aria-label="Doporučení ANITKY" className="space-y-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={collapsed === false}
        className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-muted px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Sparkles className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Doporučení ANITKY</span>
          {collapsed && <span className="block text-xs text-fg-muted">{summary}</span>}
        </span>
        <ChevronDown className={`size-5 shrink-0 text-fg-muted transition-transform ${collapsed === false ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {collapsed === false && <div className="space-y-4 lg:space-y-6">{children}</div>}
    </section>
  )
}
