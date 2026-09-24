import { NavItem } from '@/components/shared/nav-item'
import type { Tab } from '@/lib/types'

// The five sections used most often. Profil and AI stay reachable through the account menu in the
// header, which keeps every label readable at 320 px instead of squeezing seven into one row.
const MOBILE_TABS: Tab[] = ['Domů', 'Nákup', 'Zásoby', 'Rozpočet', 'Obchody']

export function MobileNav({ tab, onTabChange }: { tab: Tab; onTabChange: (tab: Tab) => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/90 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden"
      aria-label="Mobilní navigace"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {MOBILE_TABS.map((item) => (
          <NavItem key={item} item={item} active={tab === item} onClick={() => onTabChange(item)} mobile />
        ))}
      </div>
    </nav>
  )
}
