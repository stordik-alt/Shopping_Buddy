import { ArrowUpRight, Sparkles } from 'lucide-react'
import { Brand } from '@/components/shared/brand'
import { NavItem } from '@/components/shared/nav-item'
import type { Tab } from '@/lib/types'

const TABS: Tab[] = ['Domů', 'Nákup', 'Zásoby', 'Obchody', 'Rozpočet', 'AI', 'Profil']

export function AppSidebar({ tab, onTabChange }: { tab: Tab; onTabChange: (tab: Tab) => void }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card px-5 py-7 lg:flex">
      <Brand />
      <nav className="mt-12 space-y-1" aria-label="Hlavní navigace">
        {TABS.map((item) => (
          <NavItem key={item} item={item} active={tab === item} onClick={() => onTabChange(item)} />
        ))}
      </nav>
      <div className="mt-auto rounded-2xl bg-primary p-4 text-primary-foreground">
        <Sparkles className="mb-5 h-5 w-5" />
        <p className="text-sm font-semibold">Chytré nákupy začínají tady.</p>
        <p className="mt-1 text-xs opacity-70">Využijte AI doporučení pro další úsporu.</p>
        <button onClick={() => onTabChange('AI')} className="mt-4 flex items-center gap-1 text-xs font-semibold">
          Vyzkoušet AI <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  )
}
