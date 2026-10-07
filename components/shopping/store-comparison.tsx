import { ArrowDownRight, MapPin } from 'lucide-react'
import { money } from '@/lib/format'
import { nearestLocation, type GpsCoords } from '@/lib/geo'
import type { Item, Store } from '@/lib/types'

export function StoreComparison({
  items,
  stores,
  plan,
  singleStoreTotals,
  priorityChainIds,
  planInputKey,
  inputKey,
  userCoords,
}: {
  items: Item[]
  stores: Store[]
  /** The latest shopping plan; the summary must use the exact subtotals shown above. */
  plan: import('@/lib/shopping-plan').ShoppingPlan | null
  singleStoreTotals: { storeId: string; chain: string; total: number; itemsPriced: number; itemsEstimated: number }[]
  priorityChainIds: string[]
  /** Input key for which the plan was built, used to avoid displaying stale totals. */
  planInputKey: string | null
  inputKey: string
  userCoords: GpsCoords | null
}) {
  const pendingCount = items.filter((item) => !item.done).length
  const priorityIds = new Set(priorityChainIds)
  const priorityStores = singleStoreTotals.filter((store) => priorityIds.has(store.storeId))

  // This card compares each priority chain as if the entire open list were bought there.
  // It intentionally does not reuse plan store subtotals, because those represent the optimized
  // split-trip result. The full-basket totals come from the same package-aware offers as the plan.
  if (pendingCount === 0 || !plan || planInputKey !== inputKey || priorityStores.length === 0) return null

  const cheapest = priorityStores.reduce((best, store) => (store.total < best.subtotal ? store : best))
  const mostExpensive = priorityStores.reduce((worst, store) => (store.total > worst.subtotal ? store : worst))
  const potentialSavings = mostExpensive.total - cheapest.total

  return (
    <section className="surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Kde nakoupit celý seznam</p>
          <p className="mt-1 text-sm text-muted-foreground">Kolik by stál celý seznam, kdybyste vše nakoupili pouze v daném prioritním řetězci.</p>
        </div>
        <MapPin className="shrink-0 text-primary" />
      </div>
      <div className="mt-5 flex flex-col gap-2">
        {priorityStores.map((entry, index) => (
          <div
            key={entry.storeId}
            className={`flex items-center justify-between gap-3 rounded-2xl p-3 text-sm ${index === 0 ? 'bg-accent-subtle text-accent-text' : 'bg-muted text-foreground'}`}
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-medium">
                {entry.chain}
                <span aria-label="prioritní obchod" className="text-primary">★</span>
                {userCoords &&
                  (() => {
                    const nearest = nearestLocation(userCoords, stores.filter((store): store is Store & { gps: GpsCoords } => store.chain === entry.chain && store.gps != null))
                    return nearest && <span className="text-xs font-normal text-muted-foreground">· {nearest.distanceKm.toFixed(1)} km</span>
                  })()}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{entry.itemsPriced} z {pendingCount} položek podle skutečných cen{entry.itemsEstimated > 0 ? ' + odhad pro chybějící ceny' : ''}</p>
            </div>
            <span className="shrink-0 font-semibold">{money(entry.total)}</span>
          </div>
        ))}
      </div>
      {potentialSavings > 0 && (
        <p className="mt-4 flex items-start gap-1.5 text-sm text-muted-foreground">
          <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Rozdíl mezi prioritními obchody při nákupu celého seznamu je {money(potentialSavings)}.
        </p>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        Nejlevnější celý košík z prioritních řetězců: <span className="font-medium text-foreground">{money(cheapest.total)}</span>
      </p>
    </section>
  )
}
