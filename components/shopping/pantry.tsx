import { Check, Package, X } from 'lucide-react'
import type { PantryItem } from '@/lib/types'

/** Household pantry ("spíž") — what the household believes it currently has at home, restocked
 *  automatically by completePurchaseAction and periodically re-checked by the pantry-checkin cron
 *  (lib/pantry.ts). A row whose askedAt is set is one the cron just asked the household about, so
 *  it's highlighted here until the household confirms ("Ještě mám") or removes it ("Došlo"). */
export function Pantry({
  items,
  onConfirm,
  onRemove,
}: {
  items: PantryItem[]
  onConfirm: (id: string) => void
  onRemove: (id: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
        <Package className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-semibold">Spíž je prázdná</p>
        <p className="mt-1 text-sm text-muted-foreground">Položky se sem přidají automaticky po dokončení nákupu.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Spíž</span>
        </div>
        <span className="text-xs text-muted-foreground">{items.length} položek</span>
      </div>
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-3 border-b border-border px-5 py-4 last:border-0">
          <div className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="font-medium">{item.name}</span>
              {item.askedAt && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Máte ještě?</span>
              )}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {item.category} · {item.quantity} {item.unit}
            </span>
          </div>
          <button
            aria-label={`Ještě mám: ${item.name}`}
            onClick={() => onConfirm(item.id)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            aria-label={`Došlo: ${item.name}`}
            onClick={() => onRemove(item.id)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
