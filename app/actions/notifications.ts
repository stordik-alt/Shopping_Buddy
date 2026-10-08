'use server'

import { eq } from 'drizzle-orm'
import { requireHousehold, requireHouseholdId } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { isNotificationKind } from '@/lib/notification-kinds'

export async function markNotificationReadAction(notificationId: string) {
  const householdId = await requireHouseholdId()
  const db = getDb()
  const notification = await db.query.notifications.findFirst({ where: eq(schema.notifications.id, notificationId) })
  if (!notification || notification.householdId !== householdId) throw new Error('Notification not found')
  await db.delete(schema.notifications).where(eq(schema.notifications.id, notificationId))
  // No revalidatePath: the app has already shown this change (components/app-shell.tsx updates its own
  // state first), and re-rendering the whole page for every tap re-ran every household query —
  // compute on the database for nothing. Other members see it after their next reload.
}

export async function markAllNotificationsReadAction() {
  const householdId = await requireHouseholdId()
  const db = getDb()
  await db.delete(schema.notifications).where(eq(schema.notifications.householdId, householdId))
  // No revalidatePath: the app has already shown this change (components/app-shell.tsx updates its own
  // state first), and re-rendering the whole page for every tap re-ran every household query —
  // compute on the database for nothing. Other members see it after their next reload.
}

/** Switches one kind of notification on or off for the signed-in member only (docs/14_NOTIFICATION_PREFERENCES.md).
 *  The member comes from the session; a kind outside the fixed list is refused. */
export async function setNotificationPreferenceAction(kind: string, enabled: boolean) {
  if (!isNotificationKind(kind) || typeof enabled !== 'boolean') throw new Error('Neplatné nastavení upozornění.')
  const { memberId } = await requireHousehold()
  await getDb()
    .insert(schema.memberNotificationSettings)
    .values({ memberId, kind, enabled, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [schema.memberNotificationSettings.memberId, schema.memberNotificationSettings.kind], set: { enabled, updatedAt: new Date() } })
}
