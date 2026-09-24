// The date an ingestion run stamps on the prices it observes.
//
// It is the real calendar date, not `lib/budget.ts`'s `TODAY` (a fixed demo date, 2026-09-19): a
// price observed on 24 September must not be dated 19 September, because the current price of a
// product is the observation with the latest date and old prices are told apart from it by date.
// With the fixed date every run — every day — produced the same "date", so the current price could
// not be told from an old one.
//
// The date is taken in Czech time: the cron runs at 05:00 local time, i.e. 03:00 or 04:00 UTC, and
// the "day" a Czech retailer's prices belong to is the Czech one.
const PRAGUE_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' })

/** `YYYY-MM-DD` for `now` in Europe/Prague ('sv-SE' formats dates as ISO). */
export function ingestionDate(now: Date = new Date()): string {
  return PRAGUE_DATE.format(now)
}
