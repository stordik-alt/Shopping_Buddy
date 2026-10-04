'use client'

import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { MobileNavButton, NavItem, tabIcons } from '@/components/shared/nav-item'
import { Sheet } from '@/components/ui/sheet'
import { AI_ASSISTANT_ENABLED } from '@/lib/features'
import type { Tab } from '@/lib/types'

// Five slots keep every label at 12 px and readable at 320 px. The four sections used most often get
// a slot; the rest sit behind "Více" (a bottom sheet) and stay one tap further.
const PRIMARY_TABS: Tab[] = ['Domů', 'Nákup', 'Zásoby', 'Rozpočet']
const MORE_TABS: Tab[] = (['Akce', 'Obchody', 'Recepty', 'Profil', 'AI'] as const).filter((tab) => tab !== 'AI' || AI_ASSISTANT_ENABLED)

export function MobileNav({ tab, onTabChange }: { tab: Tab; onTabChange: (tab: Tab) => void }) {
  const [moreOpen, setMoreOpen] = useState(false)
  // "Více" shows as the active slot while one of the sections behind it is open.
  const moreActive = MORE_TABS.includes(tab)

  function select(next: Tab) {
    setMoreOpen(false)
    onTabChange(next)
  }

  return (
    <>
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Další sekce" className="lg:hidden">
        <nav aria-label="Další sekce" className="space-y-1 pb-2">
          {MORE_TABS.map((item) => (
            <NavItem key={item} item={item} active={tab === item} onClick={() => select(item)} />
          ))}
        </nav>
      </Sheet>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden"
        aria-label="Mobilní navigace"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-0.5">
          {PRIMARY_TABS.map((item) => (
            <MobileNavButton key={item} label={item} Icon={tabIcons[item]} active={tab === item} onClick={() => select(item)} />
          ))}
          <MobileNavButton label="Více" Icon={MoreHorizontal} active={moreActive || moreOpen} expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)} />
        </div>
      </nav>
    </>
  )
}
