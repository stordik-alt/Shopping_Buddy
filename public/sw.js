// Service worker: push notifications (lib/push/) and opening the app without a signal.
// Served from the site root so its scope covers the whole app; proxy.ts keeps it public (browsers
// fetch it without the sign-in cookie) and next.config.mjs stops it from being cached.
//
// Offline: the app page is fetched from the network first, always; only when that fails (no signal)
// is the last successfully loaded page shown, so the shopping list opens in a shop without coverage.
// Changes made there are queued on the device (lib/offline-queue.ts). Next.js build files are deliberately
// not intercepted here: Vercel/CDN and the browser already cache immutable /_next/static assets by content
// hash, while a service-worker cache can otherwise keep an older dynamic chunk after a deployment.
// The cached page belongs to the signed-in account, so signing out deletes it (components/shared/app-header.tsx).

const PAGE_CACHE = 'shopping-buddy-page-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key === PAGE_CACHE || key.startsWith('shopping-buddy-static-'))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // The app page itself (a navigation to "/" with any ?tab=…).
  if (request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only a real page of a signed-in user: not a redirect to sign-in, not an error page.
          if (response.ok && !response.redirected && (response.headers.get('content-type') || '').includes('text/html')) {
            const copy = response.clone()
            event.waitUntil(caches.open(PAGE_CACHE).then((cache) => cache.put('/', copy)))
          }
          return response
        })
        .catch(async () => (await caches.match('/', { cacheName: PAGE_CACHE })) || Response.error()),
    )
    return
  }
})

self.addEventListener('push', (event) => {
  // The payload is lib/push/deliver.ts's PushMessage. Browsers require a visible notification for
  // every push, so a missing or unreadable payload still shows a generic one.
  let message = {}
  try {
    message = event.data ? event.data.json() : {}
  } catch (error) {
    console.error('Unreadable push payload', error)
  }
  const title = typeof message.title === 'string' ? message.title : 'ANITKA'
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: typeof message.body === 'string' ? message.body : 'Máte nové upozornění.',
        icon: '/brand/anitka-icon-192.png',
        badge: '/brand/anitka-favicon-32.png',
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
