import { isExpenseCategory, type ExpenseCategory } from '@/lib/expense-categories'
import { isIsoDate } from '@/lib/income-input'

// What the server accepts as a planned expense (CLAUDE.md sections 9 and 33: never trust the form).
// Pure, so the rules are tested without a database; app/actions/planned-expenses.ts applies them.
// Unlike a real expense, a planned one may be dated in the future — that is what planning is.

export type PlannedExpenseInput = { amount: number; note: string; category: string; date: string }
export type ValidPlannedExpense = { amount: number; note: string; category: ExpenseCategory; date: string }

/** The largest amount numeric(10, 2) holds. */
const MAX_AMOUNT = 99_999_999.99
const EARLIEST_DATE = '2000-01-01'
const MAX_NOTE_LENGTH = 200

/** The planned expense as it will be stored, or why it cannot be. The amount is rounded to haléře. */
export function validatePlannedExpenseInput(input: PlannedExpenseInput): { plannedExpense: ValidPlannedExpense } | { error: string } {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > MAX_AMOUNT) return { error: 'Zadejte částku větší než 0.' }
  if (!isExpenseCategory(input.category)) return { error: 'Neznámá kategorie výdaje.' }
  if (!isIsoDate(input.date)) return { error: 'Neplatné datum.' }
  if (input.date < EARLIEST_DATE) return { error: 'Datum výdaje je příliš staré.' }
  return {
    plannedExpense: {
      amount: Math.round(input.amount * 100) / 100,
      note: input.note.trim().slice(0, MAX_NOTE_LENGTH),
      category: input.category,
      date: input.date,
    },
  }
}
