import { isIsoDate } from '@/lib/income-input'

// What the server accepts as a planned transfer to the next period (docs/15 §14). Pure, so the rules are
// tested without a database; app/actions/planned-carries.ts applies them.

/** The largest amount numeric(10, 2) holds. */
const MAX_AMOUNT = 99_999_999.99

/** The plan as it will be stored: an amount, or `null` for "no plan" (blank or 0 removes it). A shortfall
 *  cannot be planned away — it is carried on by the closing itself — so a negative amount is refused. */
export function validatePlannedCarry(input: { periodStart: string; amount: number | null }, currentPeriodStart: string): { periodStart: string; amount: number | null } | { error: string } {
  if (!isIsoDate(input.periodStart)) return { error: 'Neplatné období.' }
  // A period that has ended is decided by closing it, not by planning.
  if (input.periodStart < currentPeriodStart) return { error: 'Převod lze plánovat jen pro běžné a budoucí období.' }
  if (input.amount === null || input.amount === 0) return { periodStart: input.periodStart, amount: null }
  if (!Number.isFinite(input.amount) || input.amount < 0 || input.amount > MAX_AMOUNT) return { error: 'Zadejte částku od 0 Kč výš.' }
  return { periodStart: input.periodStart, amount: Math.round(input.amount * 100) / 100 }
}
