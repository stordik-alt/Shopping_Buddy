import { X } from 'lucide-react'
import { ConfirmRemoveButton } from '@/components/shared/confirm-remove-button'
import type { Child } from '@/lib/types'

export function ChildCard({ child, onRemove }: { child: Child; onRemove: () => void }) {
  return (
    <div className="rounded-2xl bg-muted p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">{child.name}</p>
          <p className="text-xs text-muted-foreground">{child.age} let</p>
        </div>
        <ConfirmRemoveButton label={child.name} onConfirm={onRemove}>
          <X className="h-4 w-4" aria-hidden="true" />
        </ConfirmRemoveButton>
      </div>
      {child.preferences && <p className="mt-2 break-words text-xs text-muted-foreground">Preference: {child.preferences}</p>}
      {child.specialNeeds && <p className="mt-1 break-words text-xs text-destructive">Specifické potřeby: {child.specialNeeds}</p>}
    </div>
  )
}
