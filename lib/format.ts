export const money = (value: number) =>
  `${value.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`

/** Rounded to whole crowns — for averages, projections and allowances, where haléře are false
 *  precision ("345,60 Kč" a day). Prices and actual amounts keep `money`. */
export const wholeMoney = (value: number) => `${Math.round(value).toLocaleString('cs-CZ')} Kč`

/** "<count> <word>" with Czech plural agreement: `one` for 1, `few` for 2–4, `many` for 0 and 5+
 *  — which a bare "N položek" gets wrong for 1–4. Whole counts only (what these labels show). */
export const countLabel = (count: number, one: string, few: string, many: string) =>
  `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`

/** "1 položka" / "2 položky" / "5 položek". Used where a count is the main thing shown (e.g. the
 *  Zásoby folders). */
export const itemCountLabel = (count: number) => countLabel(count, 'položka', 'položky', 'položek')

/** "1 prodejna" / "2 prodejny" / "5 prodejen". */
export const storeCountLabel = (count: number) => countLabel(count, 'prodejna', 'prodejny', 'prodejen')

/** "1 záznam" / "2 záznamy" / "5 záznamů". */
export const recordCountLabel = (count: number) => countLabel(count, 'záznam', 'záznamy', 'záznamů')

/** "1 aktivní akce" / "2 aktivní akce" / "5 aktivních akcí". */
export const activeDealCountLabel = (count: number) => countLabel(count, 'aktivní akce', 'aktivní akce', 'aktivních akcí')

/** "sobota 19. září 2026" from an ISO `YYYY-MM-DD` date. Built at local noon so a timezone offset
 *  can never roll it onto the neighbouring day, and identical on server and client (no hydration
 *  mismatch). Purely presentational — callers keep the ISO string as the value. */
export const longDate = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** "24. 9." from an ISO `YYYY-MM-DD` date — the short form for places where the year is obvious
 *  (e.g. "Dříve 50,00 Kč · zaznamenáno 20. 9."). Read straight from the string, with no `Date`, so
 *  no timezone can move it onto a neighbouring day. Returns the input unchanged if it isn't an ISO
 *  date, rather than showing something wrong. */
export const shortDate = (isoDate: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  return match ? `${Number(match[3])}. ${Number(match[2])}.` : isoDate
}

const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']

/** "září 2026" from a `YYYY-MM` month key — read from the string, like shortDate. */
export const monthLabel = (month: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  return match ? `${MONTHS[Number(match[2]) - 1]} ${match[1]}` : month
}
