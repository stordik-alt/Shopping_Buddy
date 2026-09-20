import { Bell, LogOut, Moon, Sun } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Brand } from '@/components/shared/brand'
import { authClient } from '@/lib/auth/client'

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : [parts[0]?.[0] ?? '?']
  return letters.join('').toUpperCase()
}

export function AppHeader({
  title,
  date,
  dark,
  onToggleDark,
  notificationsOpen,
  onToggleNotifications,
  hasUnread,
  onProfileClick,
  userName,
}: {
  title: string
  date: string
  dark: boolean
  onToggleDark: () => void
  notificationsOpen: boolean
  onToggleNotifications: () => void
  hasUnread: boolean
  onProfileClick: () => void
  userName: string
}) {
  const router = useRouter()

  async function signOut() {
    await authClient.signOut()
    router.push('/auth/sign-in')
    router.refresh()
  }

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
          {initialsFor(userName)}
        </button>
        <button aria-label="Odhlásit se" onClick={signOut} className="icon-button">
          <LogOut />
        </button>
      </div>
    </header>
  )
}
