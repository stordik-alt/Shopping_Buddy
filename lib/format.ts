export const money = (value: number) =>
  `${value.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`

/** "1 položka" / "2 položky" / "5 položek" — Czech plural agreement, which a bare "N položek"
 *  gets wrong for 1–4. Used where a count is the main thing shown (e.g. the Zásoby folders). */
export const itemCountLabel = (count: number) => (count === 1 ? '1 položka' : count >= 2 && count <= 4 ? `${count} položky` : `${count} položek`)

/** "sobota 19. září 2026" from an ISO `YYYY-MM-DD` date. Built at local noon so a timezone offset
 *  can never roll it onto the neighbouring day, and identical on server and client (no hydration
 *  mismatch). Purely presentational — callers keep the ISO string as the value. */
export const longDate = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
