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
  options: { excludeUserId?: string; onlyUserId?: string; vapid?: VapidKeys; send?: typeof sendWebPush } = {},
): Promise<DeliveryReport> {
  const vapid = options.vapid ?? vapidFromEnv()
  const report: DeliveryReport = { sent: 0, removed: 0, failed: 0 }
  if (!vapid) return report

  const db = getDb()
  const conditions = [eq(schema.pushSubscriptions.householdId, householdId)]
  if (options.excludeUserId) conditions.push(sql`${schema.householdMembers.userId} IS DISTINCT FROM ${options.excludeUserId}`)
  if (options.onlyUserId) conditions.push(eq(schema.householdMembers.userId, options.onlyUserId))
  const subscriptions = await db
    .select({ id: schema.pushSubscriptions.id, endpoint: schema.pushSubscriptions.endpoint, p256dh: schema.pushSubscriptions.p256dh, auth: schema.pushSubscriptions.auth })
    .from(schema.pushSubscriptions)
    .innerJoin(schema.householdMembers, eq(schema.householdMembers.id, schema.pushSubscriptions.memberId))
    .where(and(...conditions))
  if (subscriptions.length === 0) return report

  const payload = JSON.stringify(message)
  const send = options.send ?? sendWebPush
  const results = await Promise.allSettled(subscriptions.map((subscription: PushSubscriptionKeys & { id: string }) => send(subscription, payload, vapid)))

  const delivered: string[] = []
  const gone: string[] = []
  results.forEach((result, index) => {
    const subscription = subscriptions[index]
    const outcome: PushResult | null = result.status === 'fulfilled' ? result.value : null
    if (outcome?.ok) return void delivered.push(subscription.id)
    if (outcome && !outcome.ok && outcome.gone) return void gone.push(subscription.id)
    report.failed += 1
    // The endpoint host tells which push service refused (Google/Apple/Mozilla); the full endpoint
    // is a per-device capability URL and stays out of the log.
    const reason = result.status === 'rejected' ? String(result.reason) : `${outcome!.status} ${outcome && !outcome.ok ? outcome.detail : ''}`
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
