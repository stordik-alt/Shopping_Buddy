import { ArrowUpRight, Sparkles } from 'lucide-react'
import { Brand } from '@/components/shared/brand'
import { NavItem } from '@/components/shared/nav-item'
import { AI_ASSISTANT_ENABLED } from '@/lib/features'
import type { Tab } from '@/lib/types'

const TABS: Tab[] = (['Domů', 'Nákup', 'Zásoby', 'Obchody', 'Rozpočet', 'AI', 'Profil'] as const).filter(
  (tab) => tab !== 'AI' || AI_ASSISTANT_ENABLED,
)

export function AppSidebar({ tab, onTabChange }: { tab: Tab; onTabChange: (tab: Tab) => void }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card px-4 py-7 lg:flex">
      <div className="px-2">
        <Brand />
      </div>
      <nav className="mt-10 space-y-1" aria-label="Hlavní navigace">
        {TABS.map((item) => (
          <NavItem key={item} item={item} active={tab === item} onClick={() => onTabChange(item)} />
        ))}
      </nav>
      {AI_ASSISTANT_ENABLED && (
      <div className="mt-auto rounded-2xl bg-accent p-4 text-accent-foreground">
        <Sparkles className="mb-4 h-5 w-5" aria-hidden="true" />
        <p className="text-sm font-semibold">Chytré nákupy začínají tady.</p>
        <p className="mt-1 text-xs opacity-80">Využijte AI doporučení pro další úsporu.</p>
        <button onClick={() => onTabChange('AI')} className="mt-3 flex min-h-9 items-center gap-1 text-xs font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Vyzkoušet AI <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      )}
    </aside>
  )
}
