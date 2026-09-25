import { and, eq, inArray, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { createHouseholdNotification } from '@/lib/notify'
import { findStaleItems } from '@/lib/reminders'

// Phase D "shopping reminders" (docs/04_ROADMAP.md): a daily Vercel Cron job (see vercel.json)
// that notifies each household about undone list items that have sat around long enough to be
// worth a nudge. Staleness itself is decided by the pure, tested lib/reminders.ts — this route
// only does the I/O: load candidates, ask the domain function which are stale, write one
// notification per household and mark those items reminded so they don't fire again.
//
// Runs outside any user's request, so there's no session to authorize against — Vercel sends
// `Authorization: Bearer $CRON_SECRET` on scheduled invocations. CRON_SECRET must be set in the
// Vercel project's environment variables for that check to actually protect this route; until
// it's set, the route allows the request through unauthenticated (see docs/07_CHANGELOG.md).
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const pendingItems = await db.query.shoppingListItems.findMany({
    where: and(eq(schema.shoppingListItems.done, false), isNull(schema.shoppingListItems.remindedAt)),
    with: { list: true },
  })

  const byHousehold = new Map<string, typeof pendingItems>()
  for (const item of pendingItems) {
    const forHousehold = byHousehold.get(item.list.householdId) ?? []
    forHousehold.push(item)
    byHousehold.set(item.list.householdId, forHousehold)
  }

  const now = new Date()
  let remindedHouseholds = 0
  let remindedItems = 0

  for (const [householdId, items] of byHousehold) {
    const stale = findStaleItems(items, now)
    if (stale.length === 0) continue

    const names = stale.map((item) => item.name)
    const detail =
      names.length <= 5
        ? `Na seznamu čeká: ${names.join(', ')}.`
        : `Na seznamu čeká ${names.length} položek, mimo jiné ${names.slice(0, 5).join(', ')}.`

    await createHouseholdNotification(db, householdId, { title: 'Nezapomeňte na nákup', detail }, { tab: 'Nákup' })
    await db
      .update(schema.shoppingListItems)
      .set({ remindedAt: now })
      .where(inArray(schema.shoppingListItems.id, stale.map((item) => item.id)))

    remindedHouseholds += 1
    remindedItems += stale.length
  }

  return NextResponse.json({ remindedHouseholds, remindedItems })
}
