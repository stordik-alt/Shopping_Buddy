import { AlertTriangle, ArrowDownRight, MapPin } from 'lucide-react'
import { budgetImpact } from '@/lib/budget'
import { money } from '@/lib/format'
import { nearestLocation, type GpsCoords } from '@/lib/geo'
import { cheapestPossibleTotal, compareStoreTotals, type ProductPrice } from '@/lib/prices'
import type { Item, Store } from '@/lib/types'

export function StoreComparison({
  items,
  productPrices,
  remaining,
  stores,
  userCoords,
}: {
  items: Item[]
  productPrices: ProductPrice[]
  remaining: number
  stores: Store[]
  userCoords: GpsCoords | null
}) {
  const pendingCount = items.filter((item) => !item.done).length
  const totals = compareStoreTotals(items, productPrices)
  if (pendingCount === 0 || totals.length === 0) return null

  const cheapest = totals[0]
  const mostExpensive = totals[totals.length - 1]
  const potentialSavings = mostExpensive.total - cheapest.total
  const bestPossible = cheapestPossibleTotal(items, productPrices)
  const impact = budgetImpact(cheapest.total, remaining)

  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Kde nakoupit celý seznam</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Odhad za {pendingCount} {pendingCount === 1 ? 'nevyřízenou položku' : 'nevyřízených položek'} v jednom obchodě.
          </p>
        </div>
        <MapPin className="shrink-0 text-primary" />
      </div>
      <div className="mt-5 flex flex-col gap-2">
        {totals.map((entry, index) => (
          <div
            key={entry.store}
            className={`flex items-center justify-between gap-3 rounded-2xl p-3 text-sm ${index === 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground'}`}
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-medium">
                {entry.store}
                {userCoords &&
                  (() => {
                    const nearest = nearestLocation(userCoords, stores.filter((store) => store.chain === entry.store))
                    return nearest && <span className="text-xs font-normal text-muted-foreground">· {nearest.distanceKm.toFixed(1)} km</span>
                  })()}
              </p>
              {entry.itemsFallback > 0 && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {entry.itemsPriced} z {entry.itemsPriced + entry.itemsFallback} položek podle skutečných cen, zbytek odhadem
                </p>
              )}
            </div>
            <span className="shrink-0 font-semibold">{money(entry.total)}</span>
          </div>
        ))}
      </div>
      {potentialSavings > 0 && (
        <p className="mt-4 flex items-start gap-1.5 text-sm text-muted-foreground">
          <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Nákup v {cheapest.store} vyjde o {money(potentialSavings)} levněji než v {mostExpensive.store}.
        </p>
      )}
      {bestPossible < cheapest.total && (
        <p className="mt-1 pl-5.5 text-xs text-muted-foreground">Rozdělením nákupu mezi obchody byste teoreticky ušetřili až na {money(bestPossible)}.</p>
      )}
      {impact.overBudget ? (
        <p className="mt-4 flex items-start gap-1.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Ani nejlevnější varianta se nevejde do zbývajícího rozpočtu ({money(remaining)}) — chybí {money(cheapest.total - remaining)}.
        </p>
      ) : (
        impact.percentOfRemaining != null && (
          <p className="mt-4 text-sm text-muted-foreground">
            Nejlevnější varianta využije <span className="font-medium text-foreground">{impact.percentOfRemaining.toFixed(0)} %</span> vašeho zbývajícího
            rozpočtu ({money(remaining)}).
          </p>
        )
      )}
    </section>
  )
}
