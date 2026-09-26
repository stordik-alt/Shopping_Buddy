import { describe, expect, it } from 'vitest'
import { validateExpenseInput, type ExpenseInput } from '@/lib/expense-input'

const TODAY = '2026-09-26'
const input = (overrides: Partial<ExpenseInput> = {}): ExpenseInput => ({ amount: 1250, note: ' Září ', category: 'Bydlení', subcategory: 'Elektřina', date: '2026-09-15', ...overrides })

describe('validateExpenseInput', () => {
  it('accepts an expense with its category, subcategory and date, trimmed and rounded', () => {
    expect(validateExpenseInput(input({ amount: 1250.456 }), TODAY)).toEqual({
      expense: { amount: 1250.46, note: 'Září', category: 'Bydlení', subcategory: 'Elektřina', date: '2026-09-15' },
    })
  })

  it('accepts no subcategory, and today', () => {
    expect(validateExpenseInput(input({ subcategory: null, date: TODAY }), TODAY)).toMatchObject({ expense: { subcategory: null, date: TODAY } })
    expect(validateExpenseInput(input({ subcategory: '  ' }), TODAY)).toMatchObject({ expense: { subcategory: null } })
  })

  it('refuses a missing or impossible amount', () => {
    for (const amount of [0, -10, Number.NaN, Number.POSITIVE_INFINITY, 100_000_000]) {
      expect(validateExpenseInput(input({ amount }), TODAY)).toEqual({ error: 'Zadejte částku větší než 0.' })
    }
  })

  it('refuses an unknown category and a subcategory of another category', () => {
    expect(validateExpenseInput(input({ category: 'Kasino' }), TODAY)).toEqual({ error: 'Neznámá kategorie výdaje.' })
    expect(validateExpenseInput(input({ category: 'Auto', subcategory: 'Elektřina' }), TODAY)).toEqual({ error: 'Podkategorie nepatří do zvolené kategorie.' })
  })

  it('refuses a date that is not one, in the future, or implausibly old', () => {
    expect(validateExpenseInput(input({ date: '2026-02-30' }), TODAY)).toEqual({ error: 'Neplatné datum.' })
    expect(validateExpenseInput(input({ date: '26. 9. 2026' }), TODAY)).toEqual({ error: 'Neplatné datum.' })
    expect(validateExpenseInput(input({ date: '2026-09-27' }), TODAY)).toEqual({ error: 'Datum výdaje nemůže být v budoucnosti.' })
    expect(validateExpenseInput(input({ date: '1999-12-31' }), TODAY)).toEqual({ error: 'Datum výdaje je příliš staré.' })
  })
})
