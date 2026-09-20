import { ChevronRight, Plus, Sparkles, Tag } from 'lucide-react'

export function QuickActions({
  onShopping,
  onStores,
  onAi,
}: {
  onShopping: () => void
  onStores: () => void
  onAi: () => void
}) {
  const actions = [
    { label: 'Přidat do nákupu', detail: 'Doplňte sdílený seznam', icon: Plus, onClick: onShopping },
    { label: 'Najít akce', detail: 'Porovnejte obchody poblíž', icon: Tag, onClick: onStores },
    { label: 'Zeptat se AI', detail: 'Naplánujte úsporný nákup', icon: Sparkles, onClick: onAi },
  ]
  return (
    <section className="grid gap-3 sm:grid-cols-3" aria-label="Rychlé akce">
      {actions.map(({ label, detail, icon: Icon, onClick }) => (
        <button
          key={label}
          onClick={onClick}
          className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{label}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail}</span>
          </span>
          <ChevronRight className="ml-auto shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
        </button>
      ))}
    </section>
  )
}
