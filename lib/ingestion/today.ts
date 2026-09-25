import { todayInPrague } from '@/lib/today'

// The date an ingestion run stamps on the prices it observes: the app's real date (lib/today.ts).
//
// It must be the real calendar date: a price observed on 24 September must not be dated
// 19 September, because the current price of a product is the observation with the latest date and
// old prices are told apart from it by date. The cron runs at 05:00 local time, i.e. 03:00 or 04:00
// UTC, and the "day" a Czech retailer's prices belong to is the Czech one.

/** `YYYY-MM-DD` for `now` in Europe/Prague. */
export function ingestionDate(now: Date = new Date()): string {
  return todayInPrague(now)
}
