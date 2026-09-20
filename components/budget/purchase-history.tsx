import { useState } from 'react'
import { ChevronDown, Repeat, ShoppingBag, Star, TrendingUp } from 'lucide-react'
import { averageMonthlySpend, favoriteStores, mostBoughtProducts, repeatPurchases } from '@/lib/purchase-history'
import { Stat } from '@/components/shared/stat'
import { money } from '@/lib/format'
import type { PurchaseRecord } from '@/lib/types'

export function PurchaseHistory({ records }: { records: PurchaseRecord[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const topStore = favoriteStores(records)[0]
  const topProduct = mostBoughtProducts(records, 1)[0]
  const repeats = repeatPurchases(records)

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-semibold">Historie nákupů</p>
        <p className="mt-1 text-sm text-muted-foreground">Dlouhodobé statistiky z uskutečněných nákupů domácnosti.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Běžná měsíční útrata" value={money(averageMonthlySpend(records))} icon={<TrendingUp />} />
        <Stat label="Oblíbený obchod" value={topStore ? `${topStore.store} (${topStore.count}×)` : '—'} icon={<Star />} />
        <Stat label="Nejčastěji kupované" value={topProduct ? `${topProduct.name} (${topProduct.count}×)` : '—'} icon={<ShoppingBag />} />
      </div>
      {repeats.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Repeat className="h-3.5 w-3.5" /> Opakované nákupy
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {repeats.map((entry) => (
              <span key={entry.name} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                {entry.name} · {entry.count}×
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        {records
          .slice()
          .reverse()
          .map((record) => (
            <div key={record.id} className="border-b border-border last:border-0">
              <button
                onClick={() => setExpandedId((current) => (current === record.id ? null : record.id))}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {record.store} <span className="font-normal text-muted-foreground">· {record.date}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{record.items.length} položek {record.discount ? `· sleva ${record.discount} Kč` : ''}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold">{money(record.total)}</span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${expandedId === record.id ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {expandedId === record.id && (
                <div className="space-y-1.5 border-t border-border bg-muted/40 px-5 py-4">
                  {record.items.map((item) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <span>
                        {item.name} · {item.quantity} {item.unit}
                      </span>
                      <span className="font-medium">{money(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
    </section>
  )
}
