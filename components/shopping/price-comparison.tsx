import { Tag, TrendingDown } from 'lucide-react'
import { comparePrices, effectivePrice, isDealActive, priceRangeLast3Months } from '@/lib/prices'
import { money } from '@/lib/format'

export function PriceComparison({ productName }: { productName: string }) {
  const product = comparePrices(productName)
  if (!product) return null
  const range = priceRangeLast3Months(product)

  return (
    <div className="rounded-xl border border-border bg-background p-3 text-xs">
      <div className="flex items-center justify-between">
        <p className="font-medium">Porovnání cen mezi obchody</p>
        <span className="flex items-center gap-1 text-muted-foreground">
          <TrendingDown className="h-3 w-3" /> {money(range.min)}–{money(range.max)} za 3 měsíce
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {product.prices.map((price, index) => (
          <div
            key={price.store}
            className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${index === 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground'}`}
          >
            <span className="font-medium">{price.store}</span>
            <span className="flex items-center gap-2">
              {isDealActive(price) && (
                <span className="flex items-center gap-1 text-[10px] font-semibold">
                  <Tag className="h-3 w-3" /> akce do {price.dealValidUntil}
                </span>
              )}
              <span className="font-semibold">{money(effectivePrice(price))}</span>
              <span className="text-muted-foreground">
                ({money(price.unitPrice)}/{price.unit})
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
