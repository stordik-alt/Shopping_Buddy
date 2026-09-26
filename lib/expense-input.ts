import { isExpenseCategory, isValidSubcategory, type ExpenseCategory } from '@/lib/expense-categories'

// What the server accepts as an expense (CLAUDE.md sections 9 and 33: never trust the form). Pure,
// so the rules are tested without a database; the Server Actions in app/actions/budget.ts apply it.

export type ExpenseInput = { amount: number; note: string; category: string; subcategory: string | null; date: string }
export type ValidExpense = { amount: number; note: string; category: ExpenseCategory; subcategory: string | null; date: string }

/** The largest amount numeric(10, 2) holds. */
const MAX_AMOUNT = 99_999_999.99
/** Older than this is a typo, not a household's expense. */
const EARLIEST_DATE = '2000-01-01'
const MAX_NOTE_LENGTH = 200

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** The expense as it will be stored, or why it cannot be. An expense is money already paid, so its
 *  date cannot be after `today` (`YYYY-MM-DD`, Prague); the amount is rounded to haléře. */
export function validateExpenseInput(input: ExpenseInput, today: string): { expense: ValidExpense } | { error: string } {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > MAX_AMOUNT) return { error: 'Zadejte částku větší než 0.' }
  if (!isExpenseCategory(input.category)) return { error: 'Neznámá kategorie výdaje.' }
  const subcategory = input.subcategory?.trim() || null
  if (!isValidSubcategory(input.category, subcategory)) return { error: 'Podkategorie nepatří do zvolené kategorie.' }
  if (!isIsoDate(input.date)) return { error: 'Neplatné datum.' }
  if (input.date > today) return { error: 'Datum výdaje nemůže být v budoucnosti.' }
  if (input.date < EARLIEST_DATE) return { error: 'Datum výdaje je příliš staré.' }
  return {
    expense: {
      amount: Math.round(input.amount * 100) / 100,
      note: input.note.trim().slice(0, MAX_NOTE_LENGTH),
      category: input.category,
      subcategory,
      date: input.date,
    },
  }
}
