import { and, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { sendWebPush, type PushResult, type PushSubscriptionKeys, type VapidKeys } from '@/lib/push/web-push'

// Delivers one household notification to the phones/browsers its members subscribed
// (push_subscriptions). The notifications table stays the source of truth — push is a best-effort
// copy: a failed push is logged and never undoes or blocks the notification itself.

/** What the service worker (public/sw.js) receives and shows. */
export type PushMessage = {
  title: string
  body: string
  /** Where tapping the notification leads, relative to the app root (lib/tab-url.ts). */
  url: string
  /** Same tag = the phone replaces the older notification instead of stacking another. */
  tag?: string
}

const VAPID_ENV = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const
const env = (name: (typeof VAPID_ENV)[number]) => process.env[name]?.trim() ?? ''

/** Whether push is switched on at all: any VAPID variable set. With none, the feature is off — no
 *  toggle in the app, nothing sent. */
export function pushConfigured(): boolean {
  return VAPID_ENV.some((name) => env(name) !== '')
}

/** The VAPID keys from the environment (generated with `pnpm push:vapid-keys`), or null when push is
 *  off. A partial configuration is an error, not "off", so a missing variable is named in the log. */
export function vapidFromEnv(): VapidKeys | null {
  if (!pushConfigured()) return null
  const missing = VAPID_ENV.filter((name) => !env(name))
  if (missing.length > 0) throw new Error(`Web Push is not fully configured. Missing: ${missing.join(', ')}`)
  // VAPID_SUBJECT is the contact push services (Apple insists) can use about this sender: mailto: or https:.
  const subject = env('VAPID_SUBJECT')
  if (!/^(mailto:|https:\/\/)/.test(subject)) throw new Error('VAPID_SUBJECT must start with mailto: or https://')
  return { publicKey: env('VAPID_PUBLIC_KEY'), privateKey: env('VAPID_PRIVATE_KEY'), subject }
}

export type DeliveryReport = { sent: number; removed: number; failed: number }

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send'

/** Sends an Expo token through Expo's push gateway. The endpoint stores the token as a query value
 *  so it remains unique in the existing per-device subscription table. */
export async function sendExpoPush(endpoint: string, message: PushMessage): Promise<PushResult> {
  const parsed = new URL(endpoint)
  const token = parsed.searchParams.get('to')
  if (parsed.origin + parsed.pathname !== EXPO_PUSH_ENDPOINT || !token || !/^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/.test(token)) {
    return { ok: false, status: 400, gone: true, detail: 'invalid Expo push token' }
  }
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' }
  if (process.env.EXPO_ACCESS_TOKEN?.trim()) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN.trim()}`
  const response = await fetch(EXPO_PUSH_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ to: token, sound: 'default', title: message.title, body: message.body, data: { url: message.url, tag: message.tag } }),
  })
  const result: unknown = await response.json().catch(() => null)
  const ticket = result && typeof result === 'object' && 'data' in result ? (result as { data?: unknown }).data : null
  const ticketObject = Array.isArray(ticket) ? ticket[0] : ticket
  if (response.ok && ticketObject && typeof ticketObject === 'object' && 'status' in ticketObject && ticketObject.status === 'ok') {
    return { ok: true, status: response.status }
  }
  const details = ticketObject && typeof ticketObject === 'object' && 'details' in ticketObject ? ticketObject.details : null
  const errorCode = details && typeof details === 'object' && 'error' in details ? details.error : null
  const messageText = ticketObject && typeof ticketObject === 'object' && 'message' in ticketObject ? ticketObject.message : null
  return {
    ok: false,
    status: response.status,
    gone: errorCode === 'DeviceNotRegistered',
    detail: typeof messageText === 'string' ? messageText : typeof errorCode === 'string' ? errorCode : 'Expo push request failed',
  }
}

/** The public key the browser subscribes with, or null when push is off or misconfigured (then the
 *  app offers no push toggle; the reason is logged, the page still renders). */
export function pushPublicKeyForClient(): string | null {
  try {
    return vapidFromEnv()?.publicKey ?? null
  } catch (error) {
    console.error(JSON.stringify({ event: 'push_config_error', error: error instanceof Error ? error.message : String(error) }))
    return null
  }
}

/** Sends `message` to every subscribed device in the household, except the devices of
 *  `excludeUserId` (the person whose own action caused the notification is looking at the app), or
 *  only to the devices of `onlyUserId` (the "send a test" button). */
export async function pushToHousehold(
  householdId: string,
  message: PushMessage,
  options: { excludeUserId?: string; onlyUserId?: string; kind?: string; vapid?: VapidKeys; send?: typeof sendWebPush; sendExpo?: typeof sendExpoPush } = {},
): Promise<DeliveryReport> {
  const vapid = options.vapid ?? vapidFromEnv()
  const report: DeliveryReport = { sent: 0, removed: 0, failed: 0 }

  const db = getDb()
  const conditions = [eq(schema.pushSubscriptions.householdId, householdId)]
  if (options.excludeUserId) conditions.push(sql`${schema.householdMembers.userId} IS DISTINCT FROM ${options.excludeUserId}`)
  if (options.onlyUserId) conditions.push(eq(schema.householdMembers.userId, options.onlyUserId))
  // A member who switched this kind off gets no push for it (docs/14_NOTIFICATION_PREFERENCES.md).
  if (options.kind) conditions.push(sql`${schema.memberNotificationSettings.enabled} IS DISTINCT FROM false`)
  const subscriptions = await db
    .select({ id: schema.pushSubscriptions.id, endpoint: schema.pushSubscriptions.endpoint, p256dh: schema.pushSubscriptions.p256dh, auth: schema.pushSubscriptions.auth })
    .from(schema.pushSubscriptions)
    .innerJoin(schema.householdMembers, eq(schema.householdMembers.id, schema.pushSubscriptions.memberId))
    .leftJoin(
      schema.memberNotificationSettings,
      and(eq(schema.memberNotificationSettings.memberId, schema.pushSubscriptions.memberId), eq(schema.memberNotificationSettings.kind, options.kind ?? '')),
    )
    .where(and(...conditions))
  if (subscriptions.length === 0) return report

  const payload = JSON.stringify(message)
  const send = options.send ?? sendWebPush
  const sendExpo = options.sendExpo ?? sendExpoPush
  const results = await Promise.allSettled(subscriptions.map((subscription: PushSubscriptionKeys & { id: string }) => {
    if (subscription.endpoint.startsWith(`${EXPO_PUSH_ENDPOINT}?to=`)) return sendExpo(subscription.endpoint, message)
    if (!vapid) return Promise.resolve({ ok: false as const, status: 503, gone: false, detail: 'Web Push is not configured' })
    return send(subscription, payload, vapid)
  }))

  const delivered: string[] = []
  const gone: string[] = []
  results.forEach((result, index) => {
    const subscription = subscriptions[index]
    const expoSubscription = subscription.endpoint.startsWith(`${EXPO_PUSH_ENDPOINT}?to=`)
    const outcome: PushResult | null = result.status === 'fulfilled' ? result.value : null
    if (outcome?.ok) return void delivered.push(subscription.id)
    if (outcome && !outcome.ok && outcome.gone) return void gone.push(subscription.id)
    report.failed += 1
    // The endpoint host tells which push service refused (Google/Apple/Mozilla); the full endpoint
    // is a per-device capability URL and stays out of the log.
    const reason = result.status === 'rejected' ? (expoSubscription ? 'Expo Push request failed' : String(result.reason)) : `${outcome!.status} ${outcome && !outcome.ok ? outcome.detail : ''}`
    console.error(JSON.stringify({ event: 'push_failed', householdId, subscriptionId: subscription.id, service: new URL(subscription.endpoint).host, reason }))
  })

  if (delivered.length > 0) {
    await db.update(schema.pushSubscriptions).set({ lastSuccessAt: new Date() }).where(inArray(schema.pushSubscriptions.id, delivered))
  }
  if (gone.length > 0) {
    // The push service says these devices unsubscribed or expired; keeping them would only fail again.
    await db.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, gone))
  }
  report.sent = delivered.length
  report.removed = gone.length
  return report
}
