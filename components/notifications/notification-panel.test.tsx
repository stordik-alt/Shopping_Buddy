import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NotificationPanel } from '@/components/notifications/notification-panel'
import type { Notification } from '@/lib/types'

// PushToggle pulls in server actions (and with them the auth server module); not under test here.
vi.mock('@/components/notifications/push-toggle', () => ({ PushToggle: () => null }))

const render = (notifications: Notification[]) =>
  renderToStaticMarkup(<NotificationPanel notifications={notifications} onRead={() => {}} onReadAll={() => {}} onClose={() => {}} pushPublicKey={null} />)

describe('NotificationPanel', () => {
  it('explains an empty panel instead of showing nothing', () => {
    expect(render([])).toContain('Žádná upozornění')
  })

  it('says "unread" in text, not only with the dot colour', () => {
    const html = render([{ id: 'n1', title: 'Rozpočet z 80 %', detail: 'Zbývá 2 000 Kč', unread: true } as Notification])
    expect(html).toContain('Nepřečteno: ')
    expect(html).not.toContain('Žádná upozornění')
  })
})
