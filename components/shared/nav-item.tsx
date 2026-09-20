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
      className={`flex items-center gap-3 rounded-xl text-sm font-medium transition-colors ${mobile ? 'min-w-12 flex-col gap-1 px-2 py-1 text-[10px]' : 'w-full px-3 py-2.5'} ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
    >
      <Icon className={mobile ? 'h-5 w-5' : 'h-[18px] w-[18px]'} />
      {item}
    </button>
  )
}
