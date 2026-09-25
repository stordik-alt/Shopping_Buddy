// Service worker for push notifications (lib/push/). It only shows notifications and opens the app
// when one is tapped — no caching, no offline handling, so it cannot serve a stale app.
// Served from the site root so its scope covers the whole app; proxy.ts keeps it public (browsers
// fetch it without the sign-in cookie) and next.config.mjs stops it from being cached.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  // The payload is lib/push/deliver.ts's PushMessage. Browsers require a visible notification for
  // every push, so a missing or unreadable payload still shows a generic one.
  let message = {}
  try {
    message = event.data ? event.data.json() : {}
  } catch (error) {
    console.error('Unreadable push payload', error)
  }
  const title = typeof message.title === 'string' ? message.title : 'Buddy'
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: typeof message.body === 'string' ? message.body : 'Máte nové upozornění.',
        icon: '/brand/buddy-icon-192.png',
        badge: '/brand/buddy-favicon-32.png',
        tag: typeof message.tag === 'string' ? message.tag : undefined,
        lang: 'cs',
        data: { url: typeof message.url === 'string' && message.url.startsWith('/') ? message.url : '/' },
      }),
      // An open app window refreshes its bell panel right away instead of waiting for the next poll.
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
        for (const client of windows) client.postMessage({ type: 'push-received' })
      }),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url ?? '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Reuse an open app window (the installed app on a phone) instead of opening a second one.
      // Focus first, while the tap still counts as a user action; then move it to the section. A
      // window this worker does not control cannot be navigated, so it just stays focused.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.focus().then((focused) => (focused.url === target ? focused : focused.navigate(target).catch(() => focused)))
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
