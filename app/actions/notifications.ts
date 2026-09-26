'use server'

import { eq } from 'drizzle-orm'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

export async function markNotificationReadAction(notificationId: string) {
  const householdId = await requireHouseholdId()
  const db = getDb()
  const notification = await db.query.notifications.findFirst({ where: eq(schema.notifications.id, notificationId) })
  if (!notification || notification.householdId !== householdId) throw new Error('Notification not found')
  await db.update(schema.notifications).set({ unread: false }).where(eq(schema.notifications.id, notificationId))
  // No revalidatePath: the app has already shown this change (components/app-shell.tsx updates its own
  // state first), and re-rendering the whole page for every tap re-ran every household query —
  // compute on the database for nothing. Other members see it on their next refresh (once a minute).
}

export async function markAllNotificationsReadAction() {
  const householdId = await requireHouseholdId()
  const db = getDb()
  await db.update(schema.notifications).set({ unread: false }).where(eq(schema.notifications.householdId, householdId))
  // No revalidatePath: the app has already shown this change (components/app-shell.tsx updates its own
  // state first), and re-rendering the whole page for every tap re-ran every household query —
  // compute on the database for nothing. Other members see it on their next refresh (once a minute).
}
