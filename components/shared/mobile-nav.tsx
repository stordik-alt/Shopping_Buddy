'use client'

import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MobileNavButton, NavItem, tabIcons } from '@/components/shared/nav-item'
import { AI_ASSISTANT_ENABLED } from '@/lib/features'
import type { Tab } from '@/lib/types'

// Five slots keep every label at 12 px and readable at 320 px. The four sections used most often get
// a slot; the rest sit behind "Více" (a sheet above the bar) and stay one tap further.
const PRIMARY_TABS: Tab[] = ['Domů', 'Nákup', 'Zásoby', 'Rozpočet']
const MORE_TABS: Tab[] = (['Akce', 'Obchody', 'Profil', 'AI'] as const).filter((tab) => tab !== 'AI' || AI_ASSISTANT_ENABLED)

export function MobileNav({ tab, onTabChange }: { tab: Tab; onTabChange: (tab: Tab) => void }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const moreButtonRef = useRef<HTMLDivElement>(null)
  // "Více" shows as the active slot while one of the sections behind it is open.
  const moreActive = MORE_TABS.includes(tab)

  useEffect(() => {
    if (!moreOpen) return
    // The sheet sits before the bar in the page, so Tab from "Více" would skip it: move focus into it
    // on open, and back to "Více" when Escape closes it.
    menuRef.current?.querySelector('button')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMoreOpen(false)
      moreButtonRef.current?.querySelector('button')?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [moreOpen])

  function select(next: Tab) {
    setMoreOpen(false)
    onTabChange(next)
  }

  return (
    <>
      {moreOpen && (
        <>
          {/* Tapping outside the sheet closes it. */}
          <button type="button" aria-label="Zavřít nabídku" className="fixed inset-0 z-20 cursor-default bg-black/30 lg:hidden" onClick={() => setMoreOpen(false)} />
          <div
            id="mobile-more-menu"
            ref={menuRef}
            role="group"
            aria-label="Další sekce"
            className="fixed inset-x-2 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-lg space-y-1 rounded-2xl border border-border bg-card p-2 shadow-lg lg:hidden"
          >
            {MORE_TABS.map((item) => (
              <NavItem key={item} item={item} active={tab === item} onClick={() => select(item)} />
            ))}
          </div>
        </>
      )}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/90 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden"
        aria-label="Mobilní navigace"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-0.5">
          {PRIMARY_TABS.map((item) => (
            <MobileNavButton key={item} label={item} Icon={tabIcons[item]} active={tab === item} onClick={() => select(item)} />
          ))}
          <div ref={moreButtonRef} className="contents">
            <MobileNavButton label="Více" Icon={MoreHorizontal} active={moreActive || moreOpen} expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)} />
          </div>
        </div>
      </nav>
    </>
  )
}
