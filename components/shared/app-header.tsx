import { Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { AccountMenu } from '@/components/shared/account-menu'
import { Brand } from '@/components/shared/brand'
import { authClient } from '@/lib/auth/client'
import type { Tab } from '@/lib/types'

export function AppHeader({
  title,
  mobileTitle,
  date,
  dark,
  onToggleDark,
  notificationsOpen,
  onToggleNotifications,
  unreadCount,
  onSelectTab,
  userName,
}: {
  title: string
  mobileTitle: string
  date: string
  dark: boolean
  onToggleDark: () => void
  notificationsOpen: boolean
  onToggleNotifications: () => void
  unreadCount: number
  onSelectTab: (tab: Tab) => void
  userName: string
}) {
  const router = useRouter()

  async function signOut() {
    await authClient.signOut()
    router.push('/auth/sign-in')
    router.refresh()
  }

  return (
    // Sticky with a frosted background on phones so the title and the bell/account controls stay
    // in reach while scrolling a long list; on desktop it is a plain page heading.
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/60 bg-background/85 px-4 py-2.5 backdrop-blur-xl sm:px-8 lg:static lg:border-0 lg:bg-transparent lg:px-12 lg:py-8 lg:backdrop-blur-none">
      <div className="flex min-w-0 items-center gap-3 lg:hidden">
        <Brand compact />
        <h1 className="truncate text-base font-semibold tracking-tight">{mobileTitle}</h1>
      </div>
      <div className="hidden lg:block">
        <p className="text-sm text-muted-foreground first-letter:uppercase">{date}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          aria-label={unreadCount > 0 ? `Oznámení, ${unreadCount} nepřečtených` : 'Oznámení'}
          aria-expanded={notificationsOpen}
          aria-controls="notifications-panel"
          onClick={onToggleNotifications}
          className="icon-button relative"
        >
          <Bell />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        <AccountMenu userName={userName} dark={dark} onToggleDark={onToggleDark} onSelectTab={onSelectTab} onSignOut={signOut} />
      </div>
    </header>
  )
}
