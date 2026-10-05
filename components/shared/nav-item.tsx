import { Bot, CookingPot, House, Package, ShoppingCart, Store, Tag, Users, WalletCards, type LucideIcon } from 'lucide-react'
import type { Tab } from '@/lib/types'
import { cn } from '@/lib/utils'

/** ANITKA navigation icon system.
 * Primary product areas use the same semantic Lucide icon everywhere.
 */
export const tabIcons = {
  Domů: House,
  Akce: Tag,
  Nákup: ShoppingCart,
  Zásoby: Package,
  Obchody: Store,
  Recepty: CookingPot,
  Rozpočet: WalletCards,
  AI: Bot,
  Profil: Users,
} satisfies Record<Tab, LucideIcon>

/** One slot of the phone's bottom bar. The active state is a filled pill behind the icon (not just a
 * colour change), so it is still obvious for users who cannot tell the two colours apart. */
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
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-expanded={expanded}
      className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0 py-1.5 text-xs font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', active ? 'bg-accent-subtle text-accent-text' : 'text-fg-muted')}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className={cn('max-w-full truncate', active ? 'font-semibold text-foreground' : 'text-fg-muted')}>{label}</span>
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
      className={cn(
        'relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        // Active = tinted row + bold label + a turquoise bar on the left, so it does not rely on colour alone.
        active
          ? 'bg-accent-subtle font-semibold text-accent-text before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-accent-solid'
          : 'font-medium text-fg-secondary hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="whitespace-nowrap">{item}</span>
    </button>
  )
}
