import { ChevronRight, Clock, ReceiptText } from 'lucide-react'
import type { AttentionItem } from '@/lib/attention'
import type { Tab } from '@/lib/types'

/** "Dnes je důležité": what needs the household's action now (lib/attention.ts), at the top of the
 *  home screen, each line leading to where it is dealt with. Renders nothing on a quiet day. */
export function TodayAttention({ items, onOpen }: { items: AttentionItem[]; onOpen: (tab: Tab) => void }) {
  if (items.length === 0) return null
  return (
    <section aria-label="Dnes je důležité" className="rounded-3xl border border-accent bg-accent/40 p-2">
      <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-accent-foreground">Dnes je důležité</p>
      <ul>
        {items.map((item) => {
          const Icon = item.kind === 'receipt' ? ReceiptText : Clock
          return (
            <li key={item.id}>
              <button
                onClick={() => onOpen(item.tab)}
                className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon className="h-4 w-4 shrink-0 text-accent-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words font-medium">{item.text}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
