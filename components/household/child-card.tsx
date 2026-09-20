import { X } from 'lucide-react'
import type { Child } from '@/lib/types'

export function ChildCard({ child, onRemove }: { child: Child; onRemove: () => void }) {
  return (
    <div className="rounded-2xl bg-muted p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{child.name}</p>
          <p className="text-xs text-muted-foreground">{child.age} let</p>
        </div>
        <button aria-label={`Odebrat ${child.name}`} onClick={onRemove} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <X className="h-4 w-4" />
        </button>
      </div>
      {child.preferences && <p className="mt-2 text-xs text-muted-foreground">Preference: {child.preferences}</p>}
      {child.specialNeeds && <p className="mt-1 text-xs text-destructive">Specifické potřeby: {child.specialNeeds}</p>}
    </div>
  )
}
