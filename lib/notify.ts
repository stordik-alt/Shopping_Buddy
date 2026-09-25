import { after } from 'next/server'
import type { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { pushConfigured, pushToHousehold } from '@/lib/push/deliver'
import { tabHref } from '@/lib/tab-url'
import type { Tab } from '@/lib/types'

// The one place that creates a household notification: stores it (the in-app bell panel reads the
// notifications table) and, when Web Push is configured, also sends it to the members' phones.
// The push goes out after the response (`after`), so a slow push service never delays the action
// or cron job that raised the notification, and a failed push never fails it.

type Db = ReturnType<typeof getDb>

export async function createHouseholdNotification(
  db: Db,
  householdId: string,
  content: { title: string; detail: string },
  options: {
    /** The section a tap on the phone notification opens. */
    tab?: Tab
    /** The member who caused it is looking at the app already; their devices are skipped. */
    excludeUserId?: string
  } = {},
) {
  const [row] = await db.insert(schema.notifications).values({ householdId, title: content.title, detail: content.detail }).returning()

  if (pushConfigured()) {
    const message = { title: content.title, body: content.detail, url: tabHref(options.tab ?? 'Domů'), tag: row.id }
    after(async () => {
      try {
        await pushToHousehold(householdId, message, { excludeUserId: options.excludeUserId })
      } catch (error) {
        // Push is a copy of a notification that is already stored; log why it failed and move on.
        console.error(JSON.stringify({ event: 'push_delivery_error', householdId, notificationId: row.id, error: error instanceof Error ? error.message : String(error) }))
      }
    })
  }
  return row
}
