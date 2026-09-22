import { NavItem } from '@/components/shared/nav-item'
import type { Tab } from '@/lib/types'

const TABS: Tab[] = ['Domů', 'Nákup', 'Obchody', 'Rozpočet', 'AI', 'Profil']

export function MobileNav({ tab, onTabChange }: { tab: Tab; onTabChange: (tab: Tab) => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 px-1.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden"
      aria-label="Mobilní navigace"
    >
      <div className="mx-auto grid max-w-lg grid-cols-6 gap-0.5">
        {TABS.map((item) => (
          <NavItem key={item} item={item} active={tab === item} onClick={() => onTabChange(item)} mobile />
        ))}
      </div>
    </nav>
  )
}
