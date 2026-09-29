import { Bot, Home, ListChecks, MapPin, Package, Tag, Users, Wallet, type LucideIcon } from 'lucide-react'
import type { Tab } from '@/lib/types'

export const tabIcons = { Domů: Home, Akce: Tag, Nákup: ListChecks, Zásoby: Package, Obchody: MapPin, Rozpočet: Wallet, AI: Bot, Profil: Users }

/** One slot of the phone's bottom bar. The active state is a filled pill behind the icon (not just a
 *  colour change), so it is still obvious for users who cannot tell the two colours apart. */
export function MobileNavButton({
  label,
  Icon,
  active,
  onClick,
  expanded,
}: {
  label: string
  Icon: LucideIcon
  active: boolean
  onClick: () => void
  expanded?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-expanded={expanded}
      className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0 py-1.5 text-xs font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? 'bg-primary/15 text-primary' : 'text-muted-foreground'}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className={`max-w-full truncate ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
    </button>
  )
}

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
  const Icon = tabIcons[item]

  if (mobile) return <MobileNavButton label={item} Icon={Icon} active={active} onClick={onClick} />

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
