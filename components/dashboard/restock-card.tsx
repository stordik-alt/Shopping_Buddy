import { Plus, Tag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { money, shortDate } from '@/lib/format'
import type { RestockSuggestion } from '@/lib/pantry-restock'

const amount = (value: number) => String(Math.round(value * 1000) / 1000).replace('.', ',')

/** Domů: stock that nears the minimum the household set while a preferred chain runs a promotion on it
 *  (lib/pantry-restock.ts). Shown only when there is something to say; each line names the chain, the
 *  price, how long it lasts and how much is missing up to the maximum. */
export function RestockCard({ suggestions, listItemNames, onAddToList }: { suggestions: RestockSuggestion[]; listItemNames: string[]; onAddToList: (name: string) => void }) {
  if (suggestions.length === 0) return null
  const onList = new Set(listItemNames.map((name) => name.trim().toLowerCase()))
  return (
    <Card aria-label="Doplnit zásoby" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Je dobrá doba doplnit zásobu</p>
          <p className="mt-1 text-sm text-fg-secondary">Zásoba se blíží minimu a ve vašem prioritním obchodě je akce.</p>
        </div>
        <Tag className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
      </div>
      <ul className="divide-y divide-border">
        {suggestions.map((suggestion) => {
          const { offer } = suggestion
          const added = onList.has(suggestion.itemName.trim().toLowerCase())
          return (
            <li key={suggestion.itemId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1 basis-56">
                <p className="break-words font-medium">{suggestion.itemName}</p>
                <p className="text-sm text-fg-muted">
                  Zbývá {amount(suggestion.quantity)} {suggestion.unit} (minimum {amount(suggestion.minQuantity)}) · doplnit asi {amount(suggestion.buyQuantity)} {suggestion.unit}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                  <Badge tone="accent" className="py-0.5">
                    {offer.chain} {money(offer.dealPrice)}
                  </Badge>
                  {offer.discount != null && <span className="text-fg-secondary">−{Math.round(offer.discount * 100)} %</span>}
                  <span className="text-fg-muted">do {shortDate(offer.validUntil)}</span>
                </p>
                <p className="break-words text-xs text-fg-muted">{offer.productName}</p>
              </div>
              <Button variant="outline" disabled={added} onClick={() => onAddToList(suggestion.itemName)}>
                <Plus aria-hidden /> {added ? 'Na seznamu' : 'Na seznam'}
              </Button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
