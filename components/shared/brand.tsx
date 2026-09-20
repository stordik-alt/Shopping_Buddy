import { ShoppingCart } from 'lucide-react'

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <ShoppingCart className="h-4 w-4" />
      </div>
      {!compact && <span className="text-lg font-semibold tracking-tight">Rodinný nákup</span>}
    </div>
  )
}
