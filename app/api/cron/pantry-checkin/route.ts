import { and, gte, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { createHouseholdNotification } from '@/lib/notify'
import { checkinSubcategoryKey } from '@/lib/pantry'
import { selectForWeeklyCheck, weeklyCheckMessage } from '@/lib/pantry-estimate'
import { RHYTHM_WINDOW_DAYS } from '@/lib/purchase-rhythm'
import { PANTRY_CHECK_HREF } from '@/lib/tab-url'
import { todayInPrague } from '@/lib/today'
import type { ItemCategory, PantryItem, PurchaseRecord } from '@/lib/types'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'

// Household pantry ("spíž"): the weekly check (vercel.json, Sunday afternoon). One notification per
// household listing what to check — items whose per-category check-in interval has elapsed
// (lib/pantry.ts) and items probably used up by the household's own purchase rhythm or a short
// shelf life (lib/pantry-estimate.ts). Its link opens the check with only those items, the used-up
// ones pre-marked, so the usual answer is one tap. Replaces the earlier daily per-category nudges:
// one short weekly check costs the household less time than a question every few days.
//
// Same auth model as app/api/cron/shopping-reminders: Vercel sends `Authorization: Bearer
// $CRON_SECRET`; proxy.ts's matcher excludes all of api/cron/* from session protection, since
// there's no session to check here.
export async function GET(request: Request) {
  const rejected = rejectUnauthorizedCron(request)
  if (rejected) return rejected

  const db = getDb()
  const allItems = await db.query.pantryItems.findMany({ with: { subcategory: { columns: { name: true } } } })
  const householdIds = [...new Set(allItems.map((item) => item.householdId))]
  if (householdIds.length === 0) return NextResponse.json({ askedHouseholds: 0, askedItems: 0 })

  // Each household's own check-in interval overrides (spec section 13); a category with none uses
  // lib/pantry.ts's fixed CHECKIN_DAYS_BY_CATEGORY default.
  const checkinRows = await db.query.pantryCheckinIntervals.findMany({ where: inArray(schema.pantryCheckinIntervals.householdId, householdIds) })
  const checkinOverridesByHousehold = new Map<string, Partial<Record<ItemCategory, number>>>()
  for (const row of checkinRows) {
    const overrides = checkinOverridesByHousehold.get(row.householdId) ?? {}
    overrides[row.category] = row.days
    checkinOverridesByHousehold.set(row.householdId, overrides)
  }
  const subcategoryRows = await db.query.pantryCheckinSubcategoryIntervals.findMany({ where: inArray(schema.pantryCheckinSubcategoryIntervals.householdId, householdIds) })
  const subcategoryOverridesByHousehold = new Map<string, Record<string, number>>()
  for (const row of subcategoryRows) {
    const overrides = subcategoryOverridesByHousehold.get(row.householdId) ?? {}
    overrides[checkinSubcategoryKey(row.category, row.subcategory)] = row.days
    subcategoryOverridesByHousehold.set(row.householdId, overrides)
  }

  // Only the window the purchase rhythm looks at (lib/purchase-rhythm.ts), for households with a pantry.
  const today = todayInPrague()
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - RHYTHM_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
  const purchaseRows = await db.query.purchases.findMany({
    where: and(inArray(schema.purchases.householdId, householdIds), gte(schema.purchases.date, cutoff)),
    with: { items: true },
  })

  const pantryByHousehold = new Map<string, PantryItem[]>()
  for (const row of allItems) {
    const list = pantryByHousehold.get(row.householdId) ?? []
    list.push({
      id: row.id,
      name: row.name,
      category: row.category,
      subcategory: row.subcategory?.name ?? null,
      location: row.location,
      quantity: row.quantity,
      unit: row.unit,
      addedAt: row.addedAt.toISOString(),
      askedAt: row.askedAt?.toISOString(),
      tracking: row.tracking,
    })
    pantryByHousehold.set(row.householdId, list)
  }
  const purchasesByHousehold = new Map<string, PurchaseRecord[]>()
  for (const row of purchaseRows) {
    const list = purchasesByHousehold.get(row.householdId) ?? []
    list.push({ id: row.id, date: row.date, total: 0, items: row.items.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit, price: 0 })) })
    purchasesByHousehold.set(row.householdId, list)
  }

  const now = new Date()
  let askedHouseholds = 0
  let askedItems = 0
  for (const [householdId, items] of pantryByHousehold) {
    const selected = selectForWeeklyCheck(items, purchasesByHousehold.get(householdId) ?? [], today, now, checkinOverridesByHousehold.get(householdId) ?? {}, subcategoryOverridesByHousehold.get(householdId) ?? {})
    if (selected.length === 0) continue
    await createHouseholdNotification(db, householdId, weeklyCheckMessage(selected.map((item) => item.name)), { tab: 'Zásoby', href: PANTRY_CHECK_HREF })
    // Marks them "Máte ještě?" in the app and restarts the check-in interval for the asked ones.
    await db
      .update(schema.pantryItems)
      .set({ askedAt: now })
      .where(inArray(schema.pantryItems.id, selected.map((item) => item.id)))
    askedHouseholds += 1
    askedItems += selected.length
  }

  return NextResponse.json({ askedHouseholds, askedItems })
}
