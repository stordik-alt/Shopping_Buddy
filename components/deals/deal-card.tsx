import { Check, History, Info, Package, Plus } from 'lucide-react'
import { money, shortDate } from '@/lib/format'
import { pantryQuantityFor } from '@/lib/pantry'
import { dealDiscount, dealEffectiveUnitPrice, effectivePrice, suggestsStockingUp, type DealAssessment } from '@/lib/prices'
import { toComparableUnit } from '@/lib/product-search'
import type { PantryItem } from '@/lib/types'

export function DealCard({
  assessment,
  isOnList,
  onAddToList,
  pantryItems,
}: {
  assessment: DealAssessment
  isOnList: boolean
  onAddToList: (name: string) => void
  pantryItems: PantryItem[]
}) {
  const { product, price, isBestPrice, cheapestAlternative, recentLow } = assessment
  const discount = Math.round(dealDiscount(price) * 100)
  const comparableUnit = toComparableUnit(price.unit, dealEffectiveUnitPrice(price))
  return (
    <div className={`rounded-2xl bg-muted p-4 ${isOnList ? 'ring-1 ring-primary/40' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">{product.productName}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {price.store} · akce do {shortDate(price.dealValidUntil ?? '')}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/15 px-2 py-1 text-xs font-semibold text-primary">-{discount} %</span>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <span className="text-lg font-semibold">{money(price.dealPrice ?? price.regularPrice)}</span>
          <span className="ml-2 text-xs text-muted-foreground line-through">{money(price.regularPrice)}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{money(comparableUnit.unitPrice)}/{comparableUnit.unit}</span>
        </div>
        {isOnList ? (
          <span className="flex min-h-9 items-center gap-1 text-xs font-medium text-muted-foreground">
            <Check className="h-3.5 w-3.5" /> Na seznamu
          </span>
        ) : (
          <button
            onClick={() => onAddToList(product.productName)}
            aria-label={`Přidat ${product.productName} na nákupní seznam`}
            className="flex min-h-9 items-center gap-1 rounded-full bg-card px-3 text-xs font-medium text-primary transition hover:bg-primary hover:text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Na seznam
          </button>
        )}
      </div>
      {recentLow && (
        <p className="mt-3 flex items-start gap-1 text-xs leading-relaxed text-success">
          <History className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            Nejnižší cena za posledních 30 dní: <span className="font-semibold">{money(recentLow.low)}</span>
            {recentLow.status === 'unchanged' && ' · Cena se nezměnila.'}
            {recentLow.status === 'at-low' && ' · Aktuálně nejnižší cena za 30 dní.'}
            {recentLow.status === 'above-low' && ` · Aktuálně o ${money(effectivePrice(price) - recentLow.low)} vyšší.`}
          </span>
        </p>
      )}
      {suggestsStockingUp(assessment, pantryQuantityFor(pantryItems, product.productName)) && (
        <p className="mt-3 flex items-start gap-1 text-xs leading-relaxed text-success">
          <Package className="mt-0.5 h-3 w-3 shrink-0" />
          Doma toho máte málo nebo nic — dobrá chvíle doplnit zásoby.
        </p>
      )}
      {!isBestPrice && cheapestAlternative && (
        <p className="mt-3 flex items-start gap-1 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Levněji je i bez akce v {cheapestAlternative.store} za {money(cheapestAlternative.price)}.
        </p>
      )}
    </div>
  )
}
