import { Bot, LogOut, Moon, Sun, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Tab } from '@/lib/types'

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : [parts[0]?.[0] ?? '?']
  return letters.join('').toUpperCase()
}

/** Avatar button that opens the account menu: household profile, AI, theme and sign-out. Groups the
 *  rarely used controls so the header stays uncluttered on a phone. Closes on Escape and on any
 *  click outside, and hands focus back to the button on Escape. */
export function AccountMenu({
  userName,
  dark,
  onToggleDark,
  onSelectTab,
  onSignOut,
}: {
  userName: string
  dark: boolean
  onToggleDark: () => void
  onSelectTab: (tab: Tab) => void
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const itemClass =
    'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const run = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((current) => !current)}
        aria-label="Účet a nastavení"
        aria-haspopup="menu"
        aria-expanded={open}
        className="ml-1 flex size-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground transition hover:ring-2 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {initialsFor(userName)}
      </button>
      {open && (
        <div role="menu" aria-label="Účet" className="absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-xl">
          <p className="truncate px-3 py-2 text-xs text-muted-foreground">{userName}</p>
          <button role="menuitem" className={itemClass} onClick={run(() => onSelectTab('Profil'))}>
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Profil domácnosti
          </button>
          <button role="menuitem" className={itemClass} onClick={run(() => onSelectTab('AI'))}>
            <Bot className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> AI asistent
          </button>
          <button role="menuitem" className={itemClass} onClick={run(onToggleDark)}>
            {dark ? <Sun className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : <Moon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
            {dark ? 'Světlý motiv' : 'Tmavý motiv'}
          </button>
          <div className="my-1 border-t border-border" />
          <button role="menuitem" className={`${itemClass} text-destructive`} onClick={run(onSignOut)}>
            <LogOut className="h-4 w-4" aria-hidden="true" /> Odhlásit se
          </button>
        </div>
      )}
    </div>
  )
}
