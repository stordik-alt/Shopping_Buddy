// Announces new flyers to the households that chose the chain (docs/21_NEW_FLYER_NOTIFICATIONS.md). Runs
// in the daily morning cron, when the database is awake anyway; which flyers count is decided by the
// pure lib/deal-announcements.ts.

import { and, count, eq, gte, inArray, lte } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { announcementKey, announcementText, DAYS_AHEAD, flyersToAnnounce, shiftDate, type FlyerStart } from '@/lib/deal-announcements'
import { createHouseholdNotification } from '@/lib/notify'
import { dealsChainHref } from '@/lib/tab-url'

export type AnnouncementRun = { flyers: { chain: string; validFrom: string; deals: number; households: number }[] }

/** Each household's chosen chains: the chains its members picked in "Moje obchody v okolí" (as a chain
 *  or through a branch), and its preferred stores matched to a chain name ignoring case. */
async function chosenChainsByHousehold(): Promise<Map<string, Set<string>>> {
  const db = getDb()
  const [picked, preferences, stores] = await Promise.all([
    db
      .selectDistinct({ householdId: schema.householdMembers.householdId, storeId: schema.memberStores.storeId })
      .from(schema.memberStores)
      .innerJoin(schema.householdMembers, eq(schema.householdMembers.id, schema.memberStores.memberId)),
    db.query.preferences.findMany({ columns: { householdId: true, preferredStores: true } }),
    db.query.stores.findMany({ columns: { id: true, chain: true } }),
  ])
  const byHousehold = new Map<string, Set<string>>()
  const add = (householdId: string, storeId: string) => byHousehold.set(householdId, (byHousehold.get(householdId) ?? new Set()).add(storeId))
  for (const row of picked) add(row.householdId, row.storeId)
  const storeIdByChain = new Map(stores.map((store) => [store.chain.trim().toLowerCase(), store.id]))
  for (const row of preferences) {
    for (const name of row.preferredStores) {
      const storeId = storeIdByChain.get(name.trim().toLowerCase())
      if (storeId) add(row.householdId, storeId)
    }
  }
  return byHousehold
}

/** Announces every flyer that starts from yesterday up to DAYS_AHEAD days ahead and has not been
 *  announced yet, with one notification per chain to each household that chose the chain. */
export async function announceNewFlyers(today: string): Promise<AnnouncementRun> {
  const db = getDb()
  const earliest = shiftDate(today, -1)
  const latest = shiftDate(today, DAYS_AHEAD)
  const starts: FlyerStart[] = (
    await db
      .select({ storeId: schema.deals.storeId, chain: schema.stores.chain, validFrom: schema.deals.validFrom, deals: count() })
      .from(schema.deals)
      .innerJoin(schema.stores, eq(schema.stores.id, schema.deals.storeId))
      // Online shops start promotions nearly every day: they have no flyers to announce.
      .where(and(eq(schema.stores.isOnline, false), gte(schema.deals.validFrom, earliest), lte(schema.deals.validFrom, latest)))
      .groupBy(schema.deals.storeId, schema.stores.chain, schema.deals.validFrom)
  ).map((row) => ({ ...row, deals: Number(row.deals) }))
  if (starts.length === 0) return { flyers: [] }

  const announcedRows = await db.query.dealAnnouncements.findMany({
    where: and(inArray(schema.dealAnnouncements.storeId, [...new Set(starts.map((start) => start.storeId))]), gte(schema.dealAnnouncements.validFrom, earliest)),
    columns: { storeId: true, validFrom: true },
  })
  const due = flyersToAnnounce(starts, new Set(announcedRows.map(announcementKey)), today)
  if (due.length === 0) return { flyers: [] }

  const chosen = await chosenChainsByHousehold()
  const run: AnnouncementRun = { flyers: [] }
  for (const flyer of due) {
    // Claimed first: a run that loses the race to an overlapping one sends nothing for this flyer.
    const claimed = await db
      .insert(schema.dealAnnouncements)
      .values({ storeId: flyer.storeId, validFrom: flyer.validFrom, dealCount: flyer.deals })
      .onConflictDoNothing()
      .returning({ storeId: schema.dealAnnouncements.storeId })
    if (claimed.length === 0) continue
    const text = announcementText(flyer, today)
    let households = 0
    for (const [householdId, chains] of chosen) {
      if (!chains.has(flyer.storeId)) continue
      await createHouseholdNotification(db, householdId, text, { kind: 'new_deals', href: dealsChainHref(flyer.chain) })
      households++
    }
    run.flyers.push({ chain: flyer.chain, validFrom: flyer.validFrom, deals: flyer.deals, households })
  }
  return run
}
