import { Bot, Home, ListChecks, MapPin, Users, Wallet } from 'lucide-react'
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
      className={`flex items-center justify-center gap-3 rounded-xl text-sm font-medium transition-colors ${mobile ? 'min-w-0 min-h-11 w-full flex-col gap-0.5 px-0.5 py-1.5 text-[11px] leading-tight' : 'w-full px-3 py-2.5'} ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
    >
      <Icon className={mobile ? 'h-5 w-5 shrink-0' : 'h-[18px] w-[18px]'} />
      <span className="whitespace-nowrap">{item}</span>
    </button>
  )
}
