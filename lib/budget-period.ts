// docs/15 §3: the budget period is what the household actually manages money by. Three kinds:
//  - calendar: the calendar month (the period starts on the 1st),
//  - payday:   starts on a fixed day of the month (1–28), e.g. the 15th → "15th to 14th",
//  - custom:   starts on an anchor date and repeats every `lengthDays` days.
// Periods are always computed from this config, never stored, so changing the config re-slices
// history consistently. A period is identified by its start date (`YYYY-MM-DD`). Dates are handled as
// strings and UTC day numbers, never local `Date`s, so no time zone can shift a day. This file is the
// one implementation of period arithmetic; lib/budget.ts builds the budget maths on top of it.

export type PeriodConfig =
  | { type: 'calendar' }
  | { type: 'payday'; startDay: number }
  | { type: 'custom'; anchor: string; lengthDays: number }

/** What the budget functions accept as "the period": a config, or — as a shorthand kept for the many
 *  callers that only know the start day — a number meaning "payday N" (1 is the calendar month). */
export type PeriodInput = PeriodConfig | number

export const MIN_CUSTOM_PERIOD_DAYS = 7
export const MAX_CUSTOM_PERIOD_DAYS = 366

/** The latest day of the month a period may start on: every month has one, so the period always
 *  begins on a real date (a start on the 31st would have no February). */
export const MAX_PERIOD_START_DAY = 28

/** The calendar month — the default when a household has chosen nothing else. */
export const CALENDAR_PERIOD: PeriodConfig = { type: 'calendar' }

const DAY_MS = 86_400_000

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Whole days since the Unix epoch of an ISO date. */
export const dayNumber = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / DAY_MS
}

export const isoFromDayNumber = (days: number) => new Date(days * DAY_MS).toISOString().slice(0, 10)

/** Whether `value` is a usable period start day: a whole number from 1 to 28. */
export const isValidPeriodStartDay = (value: number) => Number.isInteger(value) && value >= 1 && value <= MAX_PERIOD_START_DAY

/** The config a `PeriodInput` stands for. */
export function toPeriodConfig(period: PeriodInput): PeriodConfig {
  return typeof period === 'number' ? { type: 'payday', startDay: period } : period
}

/** Whether the period is the plain calendar month — what decides if the UI says "měsíc" or "období". */
export function isCalendarMonth(period: PeriodInput): boolean {
  const config = toPeriodConfig(period)
  return config.type === 'calendar' || (config.type === 'payday' && config.startDay === 1)
}

/** A stable text key of the config, for effects that must reset when the period kind changes. */
export function periodConfigKey(period: PeriodInput): string {
  const config = toPeriodConfig(period)
  if (config.type === 'calendar') return 'calendar'
  if (config.type === 'payday') return `payday:${config.startDay}`
  return `custom:${config.anchor}:${config.lengthDays}`
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Whether `value` is a real `YYYY-MM-DD` date (rejects e.g. 2026-02-31, which Date would roll over). */
function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  return isoFromDayNumber(dayNumber(value)) === value
}

/** Why `config` cannot be used, or `null` when it is valid. Server-side input validation reuses this
 *  so the database never receives a period the resolver cannot handle. */
export function periodConfigError(config: PeriodConfig): string | null {
  if (config.type === 'calendar') return null
  if (config.type === 'payday') {
    return isValidPeriodStartDay(config.startDay) ? null : 'Den začátku období musí být celé číslo od 1 do 28.'
  }
  if (!isIsoDate(config.anchor)) return 'Začátek vlastního období musí být platné datum.'
  if (!Number.isInteger(config.lengthDays) || config.lengthDays < MIN_CUSTOM_PERIOD_DAYS || config.lengthDays > MAX_CUSTOM_PERIOD_DAYS) {
    return `Délka vlastního období musí být celé číslo od ${MIN_CUSTOM_PERIOD_DAYS} do ${MAX_CUSTOM_PERIOD_DAYS} dnů.`
  }
  return null
}

/** A period config from untrusted input (a Server Action argument): the shape is checked first, so a
 *  malformed value never reaches the arithmetic, then the values. Extra fields are dropped. */
export function parsePeriodConfig(value: unknown): { config: PeriodConfig } | { error: string } {
  if (typeof value !== 'object' || value === null) return { error: 'Neplatné rozpočtové období.' }
  const input = value as Record<string, unknown>
  let config: PeriodConfig
  if (input.type === 'calendar') config = { type: 'calendar' }
  else if (input.type === 'payday' && typeof input.startDay === 'number') config = { type: 'payday', startDay: input.startDay }
  else if (input.type === 'custom' && typeof input.anchor === 'string' && typeof input.lengthDays === 'number') {
    config = { type: 'custom', anchor: input.anchor, lengthDays: input.lengthDays }
  } else return { error: 'Neplatné rozpočtové období.' }
  const error = periodConfigError(config)
  return error ? { error } : { config }
}

/** The start day of the month-based kinds (1 for the calendar month); `null` for a custom period. */
export function monthlyStartDay(config: PeriodConfig): number | null {
  if (config.type === 'calendar') return 1
  if (config.type === 'payday') return config.startDay
  return null
}

/** First day of the month-based period `date` falls in: the latest `startDay` on or before it. */
function monthlyPeriodStart(date: string, startDay: number): string {
  const [year, month, day] = date.split('-').map(Number)
  if (day >= startDay) return `${year}-${pad2(month)}-${pad2(startDay)}`
  return month === 1 ? `${year - 1}-12-${pad2(startDay)}` : `${year}-${pad2(month - 1)}-${pad2(startDay)}`
}

/** First day of the month-based period after the one that starts on `start`. */
function monthlyNextPeriodStart(start: string): string {
  const [year, month, day] = start.split('-').map(Number)
  return month === 12 ? `${year + 1}-01-${pad2(day)}` : `${year}-${pad2(month + 1)}-${pad2(day)}`
}

/** The first day of the period `date` falls in. */
export function periodStartFor(config: PeriodConfig, date: string): string {
  if (config.type === 'custom') {
    // Floor division (not truncation) so dates before the anchor land in earlier periods too.
    const offset = dayNumber(date) - dayNumber(config.anchor)
    return isoFromDayNumber(dayNumber(config.anchor) + Math.floor(offset / config.lengthDays) * config.lengthDays)
  }
  return monthlyPeriodStart(date, monthlyStartDay(config) ?? 1)
}

/** The first day of the period after the one that starts on `start` (a value from periodStartFor). */
export function nextPeriodStartFor(config: PeriodConfig, start: string): string {
  if (config.type === 'custom') return isoFromDayNumber(dayNumber(start) + config.lengthDays)
  return monthlyNextPeriodStart(start)
}

/** The last day (inclusive) of the period that starts on `start`. */
export function periodEndFor(config: PeriodConfig, start: string): string {
  return isoFromDayNumber(dayNumber(nextPeriodStartFor(config, start)) - 1)
}

/** The start of the period before the one `date` falls in. */
export function previousPeriodStartFor(config: PeriodConfig, date: string): string {
  return periodStartFor(config, isoFromDayNumber(dayNumber(periodStartFor(config, date)) - 1))
}

/** Number of days in the period that starts on `start`. */
export function periodLengthFor(config: PeriodConfig, start: string): number {
  return dayNumber(nextPeriodStartFor(config, start)) - dayNumber(start)
}

/** Which day of its period `date` is, counting the first day as 1. */
export function periodDayFor(config: PeriodConfig, date: string): number {
  return dayNumber(date) - dayNumber(periodStartFor(config, date)) + 1
}

/** Days left in the period `date` falls in, `date` included (1 on its last day). */
export function periodDaysLeftFor(config: PeriodConfig, date: string): number {
  return periodLengthFor(config, periodStartFor(config, date)) - periodDayFor(config, date) + 1
}
