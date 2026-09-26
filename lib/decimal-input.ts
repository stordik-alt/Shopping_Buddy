// Numbers typed into a form field, the way people type them in Czech: "0,5" as well as "0.5", with
// spaces as thousands separators ("1 250"). Pure, so a field can keep the raw text while the user
// types and only take the number once it is one — clamping on every keystroke is what made
// "0,5 kg" impossible to type in the shopping list (the field jumped back to 1).

/** The number in `raw`, or null while it is not one yet: empty, a lone "," or ".", letters, or more
 *  than `maxDecimals` decimal places. */
export function parseDecimalInput(raw: string, maxDecimals = 3): number | null {
  const text = raw.trim().replace(/[\s ]/g, '').replace(',', '.')
  if (!new RegExp(`^\\d+(\\.\\d{1,${maxDecimals}})?$|^\\.\\d{1,${maxDecimals}}$`).test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

/** A number as the field shows it: a decimal comma, no trailing zeros ("0,5", "12", "1,25"). */
export function formatDecimalInput(value: number): string {
  return String(Math.round(value * 1000) / 1000).replace('.', ',')
}
