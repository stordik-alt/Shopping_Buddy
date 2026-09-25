import { Tag } from 'lucide-react'
import { TODAY } from '@/lib/budget'
import { money, shortDate } from '@/lib/format'
import { comparePrices, effectivePrice, isDealActive, previousPrice, type ProductPrice } from '@/lib/prices'

export function PriceComparison({ productName, productPrices }: { productName: string; productPrices: ProductPrice[] }) {
  const product = comparePrices(productPrices, productName)
  if (!product) return null

  return (
    <div className="rounded-xl border border-border bg-background p-3 text-xs">
      <p className="font-medium">Porovnání cen mezi obchody</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {product.prices.map((price, index) => {
          // The price before the last change, with the dates it was recorded and replaced — the
          // current price is always the latest observation, older ones stay visible as old prices.
          const old = previousPrice(price)
          return (
            <div
              key={price.store}
              className={`rounded-lg px-2 py-1.5 ${index === 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{price.store}</span>
                <span className="flex flex-wrap items-center justify-end gap-x-2">
                  {isDealActive(price, TODAY) && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold">
                      <Tag className="h-3 w-3" /> akce do {shortDate(price.dealValidUntil ?? '')}
                    </span>
                  )}
                  <span className="font-semibold">{money(effectivePrice(price))}</span>
                  <span className="text-muted-foreground">
                    ({money(price.unitPrice)}/{price.unit})
                  </span>
                </span>
              </div>
              {old && (
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground" data-testid="old-price">
                  Dříve {money(old.price)} · zaznamenáno {shortDate(old.recordedAt)}
                  {old.validUntil ? `, změna ${shortDate(old.validUntil)}` : ''}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
