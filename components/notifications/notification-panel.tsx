import { X } from 'lucide-react'
import type { Notification } from '@/lib/types'

export function NotificationPanel({
  notifications,
  onRead,
  onReadAll,
  onClose,
}: {
  notifications: Notification[]
  onRead: (id: string) => void
  onReadAll: () => void
  onClose: () => void
}) {
  const unreadCount = notifications.filter((notification) => notification.unread).length
  return (
    <div
      id="notifications-panel"
      role="dialog"
      aria-label="Panel upozornění"
      className="absolute right-4 top-16 z-20 w-[min(calc(100vw-2rem),360px)] rounded-2xl border border-border bg-card p-3 shadow-xl sm:right-8 lg:right-12"
    >
      <div className="flex items-center justify-between px-2 py-2">
        <div>
          <p className="text-sm font-semibold">Upozornění</p>
          <p className="text-xs text-muted-foreground">{unreadCount ? `${unreadCount} nepřečtené` : 'Vše přečteno'}</p>
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button onClick={onReadAll} className="rounded-lg px-2 py-1 text-[11px] font-medium text-primary hover:bg-muted">
              Označit vše
            </button>
          )}
          <button onClick={onClose} className="icon-button" aria-label="Zavřít upozornění">
            <X />
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {notifications.map((notification) => (
          <button
            key={notification.id}
            onClick={() => onRead(notification.id)}
            className="flex gap-3 rounded-xl p-3 text-left transition hover:bg-muted"
          >
            <span className={`mt-1 size-2 shrink-0 rounded-full ${notification.unread ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{notification.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{notification.detail}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
