'use server'

import { and, eq } from 'drizzle-orm'
import { requireHousehold } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { pushToHousehold, vapidFromEnv } from '@/lib/push/deliver'
import { parsePushSubscription } from '@/lib/push/subscription'

// Phone/browser push subscriptions of the signed-in member (lib/push/). The household and member
// always come from the session, never from the client; the client only supplies the subscription
// the browser created, which is validated before it is stored (lib/push/subscription.ts).

// Expected failures come back as a result, because Next.js hides the message of an error thrown in
// a Server Action in production (lib/errors.ts); unexpected ones (auth, database) still throw.
export type PushActionResult = { ok: true } | { ok: false; error: string }

const NOT_ENABLED: PushActionResult = { ok: false, error: 'Upozornění do telefonu nejsou na serveru zapnutá.' }

/** Stores (or refreshes) this device's subscription for the signed-in member. The same browser
 *  subscribing again — or being handed to another account — updates its one row. */
export async function savePushSubscriptionAction(subscription: unknown): Promise<PushActionResult> {
  const { householdId, memberId } = await requireHousehold()
  if (!vapidFromEnv()) return NOT_ENABLED
  const parsed = parsePushSubscription(subscription)
  if (!parsed.ok) return parsed
  const { endpoint, p256dh, auth } = parsed.value
  await getDb()
    .insert(schema.pushSubscriptions)
    .values({ householdId, memberId, endpoint, p256dh, auth })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { householdId, memberId, p256dh, auth } })
  return { ok: true }
}

/** Forgets this device. Only the signed-in member's own row can be removed. */
export async function removePushSubscriptionAction(endpoint: string): Promise<void> {
  const { memberId } = await requireHousehold()
  if (typeof endpoint !== 'string' || endpoint.length > 2048) throw new Error('Neplatný odběr upozornění')
  await getDb()
    .delete(schema.pushSubscriptions)
    .where(and(eq(schema.pushSubscriptions.endpoint, endpoint), eq(schema.pushSubscriptions.memberId, memberId)))
}

/** Sends a test notification to the signed-in member's own devices, so they can see it works. */
export async function sendTestPushAction(): Promise<PushActionResult> {
  const { householdId, userId } = await requireHousehold()
  if (!vapidFromEnv()) return NOT_ENABLED
  const report = await pushToHousehold(householdId, { title: 'Buddy', body: 'Upozornění do telefonu fungují.', url: '/', tag: 'test' }, { onlyUserId: userId })
  if (report.sent === 0) return { ok: false, error: 'Zkušební upozornění se nepodařilo doručit. Zkuste upozornění vypnout a znovu zapnout.' }
  return { ok: true }
}
