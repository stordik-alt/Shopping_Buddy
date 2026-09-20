'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

export async function markNotificationReadAction(notificationId: string) {
  const householdId = await requireHouseholdId()
  const db = getDb()
  const notification = await db.query.notifications.findFirst({ where: eq(schema.notifications.id, notificationId) })
  if (!notification || notification.householdId !== householdId) throw new Error('Notification not found')
  await db.update(schema.notifications).set({ unread: false }).where(eq(schema.notifications.id, notificationId))
  revalidatePath('/')
}

export async function markAllNotificationsReadAction() {
  const householdId = await requireHouseholdId()
  const db = getDb()
  await db.update(schema.notifications).set({ unread: false }).where(eq(schema.notifications.householdId, householdId))
  revalidatePath('/')
}
