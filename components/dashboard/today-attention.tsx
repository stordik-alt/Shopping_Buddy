import { ChevronRight, Clock, ReceiptText } from 'lucide-react'
import type { AttentionItem } from '@/lib/attention'

/** "Dnes je důležité": what needs the household's action now (lib/attention.ts), at the top of the
 *  home screen, each line leading to where it is dealt with. Renders nothing on a quiet day. */
export function TodayAttention({ items, onOpen }: { items: AttentionItem[]; onOpen: (item: AttentionItem) => void }) {
  if (items.length === 0) return null
  return (
    <section aria-label="Dnes je důležité" className="rounded-2xl bg-accent-subtle p-2">
      <h2 className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-accent-text">Dnes je důležité</h2>
      <ul>
        {items.map((item) => {
          const Icon = item.kind === 'receipt' ? ReceiptText : Clock
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon className="size-4 shrink-0 text-accent-text" aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words font-medium">{item.text}</span>
                <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
