'use client'

import { useEffect, useState } from 'react'
import { unitLabel } from '@/lib/units'
import { ChevronDown, Plus, Tag, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { money, shortDate } from '@/lib/format'
import { dismissalKey, type RestockSuggestion } from '@/lib/pantry-restock'
import { safeLocalStorage } from '@/lib/safe-storage'

/** How many suggestions the card shows before "Zobrazit další". */
const SHOWN = 3
const COLLAPSED_KEY = 'anitka.restock.collapsed'

const amount = (value: number) => String(Math.round(value * 1000) / 1000).replace('.', ',')

/** Domů: stock that nears the minimum the household set while a preferred chain runs a promotion on it
 *  (lib/pantry-restock.ts). Shown only when there is something to say; each line names the chain, the
 *  price, how long it lasts and how much is missing up to the maximum. */
export function RestockCard({ suggestions, dismissed, onDismiss, listItemNames, onAddToList }: { suggestions: RestockSuggestion[]; /** Refused offers (`dismissalKey`), the household's. */ dismissed: string[]; onDismiss: (suggestion: RestockSuggestion) => void; listItemNames: string[]; onAddToList: (suggestion: RestockSuggestion) => void }) {
  const [collapsed, setCollapsed] = useState(false)
  const [showAll, setShowAll] = useState(false)
  // Read after mount, so the server and the first client render agree. The collapse is this device's
  // own convenience; a refusal belongs to the household (the shell saves it).
  useEffect(() => {
    setCollapsed(safeLocalStorage()?.getItem(COLLAPSED_KEY) === '1')
  }, [])

  function toggle() {
    setCollapsed((current) => {
      try {
        safeLocalStorage()?.setItem(COLLAPSED_KEY, current ? '0' : '1')
      } catch {
        // The choice simply is not remembered.
      }
      return !current
    })
  }

  const visible = suggestions.filter((suggestion) => !dismissed.includes(dismissalKey(suggestion.productTypeKey, suggestion.offer.productId, suggestion.offer.validUntil)))
  if (visible.length === 0) return null
  // Ten suggestions at once is a wall: the first few, the rest one tap away.
  const shown = showAll ? visible : visible.slice(0, SHOWN)
  const onList = new Set(listItemNames.map((name) => name.trim().toLowerCase()))
  return (
    <Card aria-label="Doplnit zásoby" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Je dobrá doba doplnit zásobu</p>
          <p className="mt-1 text-sm text-fg-secondary">Zásoba druhu zboží se blíží minimu a ve vašem prioritním obchodě je akce.</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Zobrazit návrhy na doplnění zásob' : 'Skrýt návrhy na doplnění zásob'}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-accent-text hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? <ChevronDown className="size-5" aria-hidden="true" /> : <Tag className="size-5" aria-hidden="true" />}
        </button>
      </div>
      {collapsed && <p className="text-sm text-fg-muted">Skryto: {visible.length} {visible.length === 1 ? 'návrh' : visible.length < 5 ? 'návrhy' : 'návrhů'}. Klepněte na šipku pro zobrazení.</p>}
      {!collapsed && <ul className="divide-y divide-border">
        {shown.map((suggestion) => {
          const { offer } = suggestion
          const added = onList.has(offer.productName.trim().toLowerCase())
          return (
            <li key={suggestion.levelId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1 basis-56">
                <p className="break-words font-medium">{suggestion.typeName}</p>
                <p className="text-sm text-fg-muted">
                  Zbývá {amount(suggestion.quantity)} {unitLabel(suggestion.quantity, suggestion.unit)} (minimum {amount(suggestion.minQuantity)}) · doplnit asi {amount(suggestion.buyQuantity)} {unitLabel(suggestion.buyQuantity, suggestion.unit)}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                  <Badge tone="accent" className="py-0.5">
                    {offer.chain} {money(offer.dealPrice)}
                  </Badge>
                  {offer.discount != null && <span className="text-fg-secondary">−{Math.round(offer.discount * 100)} %</span>}
                  <span className="text-fg-muted">do {shortDate(offer.validUntil)}</span>
                </p>
                <p className="break-words text-xs text-fg-muted">Nejlevnější: {offer.productName}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onDismiss(suggestion)}
                aria-label={`Odmítnout návrh: ${suggestion.typeName}`}
                className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
              <Button variant="outline" disabled={added} onClick={() => onAddToList(suggestion)}>
                <Plus aria-hidden /> {added ? 'Na seznamu' : `Na seznam · ${amount(suggestion.buyQuantity)} ${unitLabel(suggestion.buyQuantity, suggestion.unit)}`}
              </Button>
              </div>
            </li>
          )
        })}
      </ul>}
      {!collapsed && visible.length > SHOWN && (
        <Button variant="ghost" onClick={() => setShowAll((current) => !current)}>
          {showAll ? 'Zobrazit méně' : `Zobrazit další (${visible.length - SHOWN})`}
        </Button>
      )}
    </Card>
  )
}
