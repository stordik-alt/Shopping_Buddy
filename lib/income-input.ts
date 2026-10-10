import type { IncomeStatus } from '@/lib/types'

// What the server accepts as an income (CLAUDE.md sections 9 and 33: never trust the form). Pure, so
// the rules are tested without a database; app/actions/incomes.ts applies it. Mirrors
// lib/expense-input.ts.

export type IncomeInput = {
  amount: number
  description: string
  date: string
  status: string
}
export type ValidIncome = {
  amount: number
  description: string
  date: string
  status: IncomeStatus
}

/** The largest amount numeric(10, 2) holds. */
const MAX_AMOUNT = 99_999_999.99
/** Older than this is a typo, not a household's income. */
const EARLIEST_DATE = '2000-01-01'
const MAX_DESCRIPTION_LENGTH = 200

export const isIncomeStatus = (value: string): value is IncomeStatus => value === 'planned' || value === 'actual'

/** Whether `value` is a real `YYYY-MM-DD` date (rejects e.g. 2026-02-31). */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** The date a received income may carry: money that arrived cannot be dated after `today`. */
export function validateReceivedDate(date: string, today: string): string | null {
  if (!isIsoDate(date)) return 'Neplatné datum.'
  if (date > today) return 'Přijatý příjem nemůže mít datum v budoucnosti.'
  if (date < EARLIEST_DATE) return 'Datum příjmu je příliš staré.'
  return null
}

/** The income as it will be stored, or why it cannot be. An 'actual' income is money already received,
 *  so its date cannot be after `today` (`YYYY-MM-DD`, Prague); a 'planned' one may be in the future.
 *  The amount is rounded to haléře. */
export function validateIncomeInput(input: IncomeInput, today: string): { income: ValidIncome } | { error: string } {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > MAX_AMOUNT) return { error: 'Zadejte částku větší než 0.' }
  if (!isIncomeStatus(input.status)) return { error: 'Neznámý stav příjmu.' }
  if (!isIsoDate(input.date)) return { error: 'Neplatné datum.' }
  if (input.date < EARLIEST_DATE) return { error: 'Datum příjmu je příliš staré.' }
  if (input.status === 'actual' && input.date > today) return { error: 'Přijatý příjem nemůže mít datum v budoucnosti.' }
  return {
    income: {
      amount: Math.round(input.amount * 100) / 100,
      description: input.description.trim().slice(0, MAX_DESCRIPTION_LENGTH),
      date: input.date,
      status: input.status,
    },
  }
}
