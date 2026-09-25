import { z } from 'zod'
import { base64UrlDecode, type PushSubscriptionKeys } from '@/lib/push/web-push'

// Validation of what a browser sends after subscribing (PushSubscription.toJSON()). The server will
// later POST to `endpoint`, so it is not trusted as given: only HTTPS URLs of the known browser push
// services are accepted. Otherwise any signed-in member could make the server send requests to an
// arbitrary address (SSRF).

/** Push services of the browsers people actually use: Chrome/Android/Samsung/Opera (Google FCM),
 *  Safari incl. iPhone home-screen apps (Apple), Firefox (Mozilla) and Edge (Windows WNS). */
export function isKnownPushService(host: string): boolean {
  const h = host.toLowerCase()
  return (
    h === 'fcm.googleapis.com' ||
    h === 'android.googleapis.com' ||
    h === 'web.push.apple.com' ||
    h.endsWith('.push.apple.com') ||
    h === 'updates.push.services.mozilla.com' ||
    h.endsWith('.push.services.mozilla.com') ||
    h.endsWith('.notify.windows.com')
  )
}

function decodesTo(length: number, check: (bytes: Uint8Array) => boolean = () => true) {
  return (value: string) => {
    if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return false
    try {
      const bytes = base64UrlDecode(value)
      return bytes.byteLength === length && check(bytes)
    } catch {
      return false // not valid base64 — rejected like any other malformed key
    }
  }
}

const subscriptionSchema = z.object({
  endpoint: z
    .string()
    .max(2048)
    .refine((value) => {
      try {
        const url = new URL(value)
        return url.protocol === 'https:' && !url.username && !url.password && !url.port && isKnownPushService(url.hostname)
      } catch {
        return false
      }
    }, 'Neznámá služba pro upozornění'),
  keys: z.object({
    // Uncompressed P-256 point: 65 bytes starting with 0x04.
    p256dh: z.string().refine(decodesTo(65, (bytes) => bytes[0] === 0x04), 'Neplatný klíč odběru'),
    auth: z.string().refine(decodesTo(16), 'Neplatný klíč odběru'),
  }),
})

/** The subscription in the shape stored in push_subscriptions, or an error message for the user. */
export function parsePushSubscription(input: unknown): { ok: true; value: PushSubscriptionKeys } | { ok: false; error: string } {
  const parsed = subscriptionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Neplatný odběr upozornění' }
  return { ok: true, value: { endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth } }
}
