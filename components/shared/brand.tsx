import { ShoppingBasket } from 'lucide-react'

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <ShoppingBasket className="h-[18px] w-[18px]" aria-hidden="true" />
      </div>
      {!compact && <span className="text-lg font-semibold tracking-tight">Rodinný nákup</span>}
    </div>
  )
}
