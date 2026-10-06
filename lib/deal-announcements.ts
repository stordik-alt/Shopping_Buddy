// Which new flyers to announce, and what the notification says (docs/21_NEW_FLYER_NOTIFICATIONS.md).
// Pure: the database side is lib/db/deal-announcements.ts.

/** A chain's deals that start on one day. */
export type FlyerStart = { storeId: string; chain: string; validFrom: string; deals: number }

/** Fewer deals starting on one day are no flyer, just a few promotions. */
export const MIN_FLYER_DEALS = 30
/** How far ahead a published flyer may start and still be announced now. */
export const DAYS_AHEAD = 3

/** `isoDate` moved by `days`, as YYYY-MM-DD. */
export function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** The identity of an announcement: one per chain and start date (`deal_announcements`). */
export const announcementKey = (start: Pick<FlyerStart, 'storeId' | 'validFrom'>) => `${start.storeId}|${start.validFrom}`

/** The flyer periods to announce today: enough deals, starting from yesterday up to DAYS_AHEAD days
 *  ahead (a late import still announces the one that began yesterday, never an old one), not
 *  announced before. Online shops must already be left out by the caller. Oldest start first. */
export function flyersToAnnounce(starts: FlyerStart[], announced: ReadonlySet<string>, today: string): FlyerStart[] {
  const earliest = shiftDate(today, -1)
  const latest = shiftDate(today, DAYS_AHEAD)
  return starts
    .filter((start) => start.deals >= MIN_FLYER_DEALS && start.validFrom >= earliest && start.validFrom <= latest && !announced.has(announcementKey(start)))
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom) || a.chain.localeCompare(b.chain, 'cs'))
}

const WEEKDAY_FROM = ['Od neděle', 'Od pondělí', 'Od úterý', 'Od středy', 'Od čtvrtka', 'Od pátku', 'Od soboty']

function dealsLabel(count: number): string {
  if (count === 1) return '1 nabídka'
  if (count >= 2 && count <= 4) return `${count} nabídky`
  return `${count} nabídek`
}

/** "Nové akce v Penny" / "Od středy 8. 10. — 266 nabídek." ("Od dneška", "Od včera", "Od zítřka"
 *  for the nearest days). */
export function announcementText(start: FlyerStart, today: string): { title: string; detail: string } {
  const date = new Date(`${start.validFrom}T12:00:00Z`)
  const day = `${date.getUTCDate()}. ${date.getUTCMonth() + 1}.`
  const from =
    start.validFrom === today ? 'Od dneška' : start.validFrom === shiftDate(today, -1) ? 'Od včera' : start.validFrom === shiftDate(today, 1) ? `Od zítřka ${day}` : `${WEEKDAY_FROM[date.getUTCDay()]} ${day}`
  return { title: `Nové akce v ${start.chain}`, detail: `${from} — ${dealsLabel(start.deals)}.` }
}
