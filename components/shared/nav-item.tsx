import { Bot, Home, ListChecks, MapPin, Package, Users, Wallet } from 'lucide-react'
import type { Tab } from '@/lib/types'

const icons = { Domů: Home, Nákup: ListChecks, Zásoby: Package, Obchody: MapPin, Rozpočet: Wallet, AI: Bot, Profil: Users }

export function NavItem({
  item,
  active,
  onClick,
  mobile = false,
}: {
  item: Tab
  active: boolean
  onClick: () => void
  mobile?: boolean
}) {
  const Icon = icons[item]

  if (mobile) {
    // The active state is a filled pill behind the icon (not just a colour change), so it is still
    // obvious for users who cannot tell the two colours apart.
    return (
      <button
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? 'bg-primary/15 text-primary' : 'text-muted-foreground'}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className={`max-w-full truncate ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{item}</span>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      ].join(' ')}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <span className="whitespace-nowrap">{item}</span>
    </button>
  )
}
