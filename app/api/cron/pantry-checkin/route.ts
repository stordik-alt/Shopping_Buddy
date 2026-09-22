import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { findDueForCheckin } from '@/lib/pantry'

// Household pantry ("spíž"): a daily Vercel Cron job that asks each household "do you still have
// this?" for pantry items whose per-category check-in interval (lib/pantry.ts) has elapsed since
// they were added/restocked or last asked about. Unlike shopping reminders, this can fire more
// than once per item — an unconfirmed pantry item stays relevant, it isn't a one-time event.
//
// Same auth model as app/api/cron/shopping-reminders: Vercel sends `Authorization: Bearer
// $CRON_SECRET`; proxy.ts's matcher excludes all of api/cron/* from session protection, since
// there's no session to check here.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const allItems = await db.query.pantryItems.findMany()

  const byHousehold = new Map<string, typeof allItems>()
  for (const item of allItems) {
    const forHousehold = byHousehold.get(item.householdId) ?? []
    forHousehold.push(item)
    byHousehold.set(item.householdId, forHousehold)
  }

  const now = new Date()
  let askedHouseholds = 0
  let askedItems = 0

  for (const [householdId, items] of byHousehold) {
    const due = findDueForCheckin(items, now)
    if (due.length === 0) continue

    const names = due.map((item) => item.name)
    const detail =
      names.length <= 5
        ? `Máte ještě doma: ${names.join(', ')}?`
        : `Máte ještě doma ${names.length} položek ze spíže, mimo jiné ${names.slice(0, 5).join(', ')}?`

    await db.insert(schema.notifications).values({ householdId, title: 'Kontrola spíže', detail })
    for (const item of due) {
      await db.update(schema.pantryItems).set({ askedAt: now }).where(eq(schema.pantryItems.id, item.id))
    }

    askedHouseholds += 1
    askedItems += due.length
  }

  return NextResponse.json({ askedHouseholds, askedItems })
}
