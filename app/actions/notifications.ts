'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

export async function markNotificationReadAction(notificationId: string) {
  const db = getDb()
  await db.update(schema.notifications).set({ unread: false }).where(eq(schema.notifications.id, notificationId))
  revalidatePath('/')
}

export async function markAllNotificationsReadAction(householdId: string) {
  const db = getDb()
  await db.update(schema.notifications).set({ unread: false }).where(eq(schema.notifications.householdId, householdId))
  revalidatePath('/')
}
