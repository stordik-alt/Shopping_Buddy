import { Check, History, Info, Package, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
    <div className={`rounded-2xl border bg-card p-4 shadow-[var(--shadow-card)] ${isOnList ? 'border-accent-solid' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">{product.productName}</p>
          <p className="mt-1 text-xs text-fg-muted">
            {price.store} · akce do {shortDate(price.dealValidUntil ?? '')}
          </p>
        </div>
        <Badge tone="accent" className="shrink-0">-{discount} %</Badge>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <span className="text-lg font-semibold">{money(price.dealPrice ?? price.regularPrice)}</span>
          <span className="ml-2 text-xs text-fg-muted line-through">{money(price.regularPrice)}</span>
          <span className="mt-0.5 block text-xs text-fg-secondary">{money(comparableUnit.unitPrice)}/{comparableUnit.unit}</span>
        </div>
        {isOnList ? (
          <Badge tone="success" className="min-h-10">
            <Check className="size-3.5" aria-hidden="true" /> Na seznamu
          </Badge>
        ) : (
          <Button variant="secondary" onClick={() => onAddToList(product.productName)} aria-label={`Přidat ${product.productName} na nákupní seznam`}>
            <Plus aria-hidden="true" /> Na seznam
          </Button>
        )}
      </div>
      {recentLow && (
        <p className="mt-3 flex items-start gap-1 text-xs leading-relaxed text-success">
          <History className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
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
          <Package className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Doma toho máte málo nebo nic — dobrá chvíle doplnit zásoby.
        </p>
      )}
      {!isBestPrice && cheapestAlternative && (
        <p className="mt-3 flex items-start gap-1 text-xs leading-relaxed text-fg-secondary">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Levněji je i bez akce v {cheapestAlternative.store} za {money(cheapestAlternative.price)}.
        </p>
      )}
    </div>
  )
}
