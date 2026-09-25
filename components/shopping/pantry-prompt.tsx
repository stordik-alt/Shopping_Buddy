import { Package } from 'lucide-react'

// Asked right after an item goes on the shopping list while the pantry still lists it: putting milk
// on the list usually means the milk ran out, so the pantry can be corrected with one tap instead of
// a separate visit to Zásoby. Nothing changes without the tap — "Ještě mám" just closes the question.
export type PantryPromptState = { pantryItemId: string; name: string; quantity: number; unit: string }

export function PantryPrompt({ prompt, onGone, onDismiss }: { prompt: PantryPromptState; onGone: () => void; onDismiss: () => void }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
      <p className="flex min-w-0 items-start gap-2">
        <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0">
          <span className="font-medium">{prompt.name}</span> máte podle zásob doma ({prompt.quantity} {prompt.unit}). Došlo?
        </span>
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onDismiss} className="min-h-9 rounded-xl px-3 text-xs font-medium text-muted-foreground hover:bg-muted">
          Ještě mám
        </button>
        <button type="button" onClick={onGone} className="min-h-9 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
          Ano, došlo
        </button>
      </div>
    </div>
  )
}
