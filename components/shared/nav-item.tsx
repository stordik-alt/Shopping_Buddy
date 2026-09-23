import { Bot, Home, ListChecks, MapPin, Package, Users, Wallet } from 'lucide-react'
import type { Tab } from '@/lib/types'

const icons = { Domů: Home, Nákup: ListChecks, Obchody: MapPin, Rozpočet: Wallet, AI: Bot, Profil: Users }

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

  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex min-h-11 items-center justify-center rounded-xl text-sm font-medium transition-colors',
        mobile
          ? 'min-w-0 w-full flex-col gap-0.5 px-0.5 py-1.5 text-[11px] leading-tight'
          : 'w-full gap-3 px-3 py-2.5',
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      ].join(' ')}
    >
      <Icon className={mobile ? 'h-5 w-5 shrink-0' : 'h-[18px] w-[18px]'} />
      <span className={mobile ? 'max-w-full text-center whitespace-normal break-words' : 'whitespace-nowrap'}>{item}</span>
    </button>
  )
}
