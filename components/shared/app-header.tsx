import { Bell, Moon, Sun } from 'lucide-react'
import { Brand } from '@/components/shared/brand'

export function AppHeader({
  title,
  date,
  dark,
  onToggleDark,
  notificationsOpen,
  onToggleNotifications,
  hasUnread,
  onProfileClick,
}: {
  title: string
  date: string
  dark: boolean
  onToggleDark: () => void
  notificationsOpen: boolean
  onToggleNotifications: () => void
  hasUnread: boolean
  onProfileClick: () => void
}) {
  return (
    <header className="flex items-center justify-between px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
      <div className="flex items-center gap-3 lg:hidden">
        <Brand compact />
      </div>
      <div className="hidden lg:block">
        <p className="text-sm text-muted-foreground">{date}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          aria-label={dark ? 'Přepnout na světlý motiv' : 'Přepnout na tmavý motiv'}
          aria-pressed={dark}
          onClick={onToggleDark}
          className="icon-button"
        >
          {dark ? <Sun /> : <Moon />}
        </button>
        <button
          aria-label="Oznámení"
          aria-expanded={notificationsOpen}
          aria-controls="notifications-panel"
          onClick={onToggleNotifications}
          className="icon-button relative"
        >
          <Bell />
          {hasUnread && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />}
        </button>
        <button
          onClick={onProfileClick}
          aria-label="Otevřít profil domácnosti"
          className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-[#f4b183] text-sm font-semibold text-[#5b321f] transition hover:ring-2 hover:ring-primary/40"
        >
          LK
        </button>
      </div>
    </header>
  )
}
