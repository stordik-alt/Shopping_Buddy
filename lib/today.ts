// The app's "today": the real calendar date in Czech time, as `YYYY-MM-DD`.
//
// It replaces a fixed demo date (`TODAY = '2026-09-19'` in lib/budget.ts) that the whole app used to
// run on — every new expense and purchase was stamped with it, the header always said "sobota
// 19. září", "this month" never moved and promotions that had ended still counted as active.
//
// Czech time, because Shopping Buddy currently serves only the Czech market and the "day" a household
// shops on, and a Czech retailer's promotion runs until, is the Czech one (a UTC date would still be
// yesterday for the first one or two hours after midnight). A per-household time zone belongs to the
// internationalization work (CLAUDE.md section 20) and would replace the fixed zone below.
//
// Server code calls this at request time. Client components receive the server's value as a prop
// instead of computing their own, so server and client never disagree about the date.
const PRAGUE_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' })

/** `YYYY-MM-DD` for `now` in Europe/Prague ('sv-SE' formats dates as ISO). */
export function todayInPrague(now: Date = new Date()): string {
  return PRAGUE_DATE.format(now)
}
