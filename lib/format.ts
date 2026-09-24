export const money = (value: number) =>
  `${value.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`

/** "1 položka" / "2 položky" / "5 položek" — Czech plural agreement, which a bare "N položek"
 *  gets wrong for 1–4. Used where a count is the main thing shown (e.g. the Zásoby folders). */
export const itemCountLabel = (count: number) => (count === 1 ? '1 položka' : count >= 2 && count <= 4 ? `${count} položky` : `${count} položek`)
