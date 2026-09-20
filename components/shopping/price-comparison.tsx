import { Tag } from 'lucide-react'
import { TODAY } from '@/lib/budget'
import { money } from '@/lib/format'
import { comparePrices, effectivePrice, isDealActive, type ProductPrice } from '@/lib/prices'

export function PriceComparison({ productName, productPrices }: { productName: string; productPrices: ProductPrice[] }) {
  const product = comparePrices(productPrices, productName)
  if (!product) return null

  return (
    <div className="rounded-xl border border-border bg-background p-3 text-xs">
      <p className="font-medium">Porovnání cen mezi obchody</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {product.prices.map((price, index) => (
          <div
            key={price.store}
            className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${index === 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground'}`}
          >
            <span className="font-medium">{price.store}</span>
            <span className="flex items-center gap-2">
              {isDealActive(price, TODAY) && (
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
