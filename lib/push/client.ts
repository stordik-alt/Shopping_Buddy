import { installPlatform } from '@/lib/install-prompt'
import { base64UrlDecode } from '@/lib/push/web-push'

// The browser side of push notifications: which state the "Upozornění do telefonu" switch shows,
// and subscribing/unsubscribing this device. Server-side storage is app/actions/push.ts.

export type PushAvailability =
  /** The browser can receive push; the switch is usable. */
  | 'available'
  /** iPhone/iPad in Safari: push works only once the app is added to the home screen (iOS 16.4+). */
  | 'ios-needs-install'
  /** The user blocked notifications for this site; only the browser settings can undo that. */
  | 'denied'
  /** No Web Push in this browser at all. */
  | 'unsupported'

export type BrowserPushFacts = {
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
  permission: NotificationPermission | null
  userAgent: string
  maxTouchPoints: number
}

/** Decides what the switch can offer. Pure, so every browser case is tested (client.test.ts). */
export function pushAvailability(facts: BrowserPushFacts): PushAvailability {
  const supported = facts.hasServiceWorker && facts.hasPushManager && facts.hasNotification
  if (!supported) {
    // Safari on iOS exposes PushManager only to home-screen apps; a plain tab lacks it.
    return installPlatform(facts.userAgent, facts.maxTouchPoints) === 'ios' ? 'ios-needs-install' : 'unsupported'
  }
  return facts.permission === 'denied' ? 'denied' : 'available'
}

export function browserPushFacts(): BrowserPushFacts {
  return {
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : null,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  }
}

const SW_URL = '/sw.js'

/** This device's current subscription, without registering anything new. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(SW_URL)
  return (await registration?.pushManager.getSubscription()) ?? null
}

/** Asks for permission and subscribes this device with the server's public key. Returns null when
 *  the user declined the permission prompt. Must start from a tap: iOS only shows the prompt then. */
export async function subscribeThisDevice(publicKey: string): Promise<PushSubscription | null> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null
  const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/', updateViaCache: 'none' })
  await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  if (existing) {
    // A subscription made with an older server key cannot be reused; replace it.
    const existingKey = existing.options.applicationServerKey
    const sameKey = existingKey && sameBytes(new Uint8Array(existingKey), base64UrlDecode(publicKey))
    if (sameKey) return existing
    await existing.unsubscribe()
  }
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlDecode(publicKey) })
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.byteLength === b.byteLength && a.every((byte, index) => byte === b[index])
}
