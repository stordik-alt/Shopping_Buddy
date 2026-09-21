import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// Continues the Server Action test coverage started in app/actions/shopping.test.ts.
let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({ requireHouseholdId: () => Promise.resolve(currentHouseholdId) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { markAllNotificationsReadAction, markNotificationReadAction } from '@/app/actions/notifications'

const db = getDb()
const createdHouseholdIds: string[] = []
let householdId: string
let otherHouseholdId: string

beforeEach(async () => {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_notifications__' }).returning()
  const [otherHousehold] = await db.insert(schema.households).values({ name: '__test_household_notifications_other__' }).returning()
  householdId = household.id
  otherHouseholdId = otherHousehold.id
  createdHouseholdIds.push(householdId, otherHouseholdId)
  currentHouseholdId = householdId
})

afterAll(async () => {
  for (const id of createdHouseholdIds) {
    await db.delete(schema.notifications).where(eq(schema.notifications.householdId, id))
    await db.delete(schema.households).where(eq(schema.households.id, id))
  }
})

describe('markNotificationReadAction', () => {
  it('rejects a notification id belonging to a different household', async () => {
    const [otherNotification] = await db.insert(schema.notifications).values({ householdId: otherHouseholdId, title: 'x', detail: 'x' }).returning()
    await expect(markNotificationReadAction(otherNotification.id)).rejects.toThrow('Notification not found')
    const stillUnread = await db.query.notifications.findFirst({ where: eq(schema.notifications.id, otherNotification.id) })
    expect(stillUnread?.unread).toBe(true)
  })

  it('marks the caller\'s own notification read', async () => {
    const [notification] = await db.insert(schema.notifications).values({ householdId, title: 'x', detail: 'x' }).returning()
    await markNotificationReadAction(notification.id)
    const row = await db.query.notifications.findFirst({ where: eq(schema.notifications.id, notification.id) })
    expect(row?.unread).toBe(false)
  })
})

describe('markAllNotificationsReadAction', () => {
  it('marks only the caller\'s own household\'s notifications read, leaving another household\'s untouched', async () => {
    const [own] = await db.insert(schema.notifications).values({ householdId, title: 'own', detail: 'x' }).returning()
    const [other] = await db.insert(schema.notifications).values({ householdId: otherHouseholdId, title: 'other', detail: 'x' }).returning()

    await markAllNotificationsReadAction()

    const ownRow = await db.query.notifications.findFirst({ where: eq(schema.notifications.id, own.id) })
    const otherRow = await db.query.notifications.findFirst({ where: eq(schema.notifications.id, other.id) })
    expect(ownRow?.unread).toBe(false)
    expect(otherRow?.unread).toBe(true)
  })
})
