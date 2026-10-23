import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SpendingDonut } from '@/components/budget/spending-donut'
import type { Expense } from '@/lib/types'

const expense = (id: string, amount: number, category: Expense['category'], date: string): Expense => ({
  id,
  amount,
  category,
  note: '',
  subcategory: null,
  date,
  purchaseId: null,
})

describe('SpendingDonut', () => {
  it('uses only positive actual expenses from the running period and exposes values in its legend', () => {
    const html = renderToStaticMarkup(
      <SpendingDonut
        today="2026-10-23"
        expenses={[
          expense('food', 1000, 'Potraviny', '2026-10-02'),
          expense('car', 500, 'Auto', '2026-10-03'),
          expense('zero', 0, 'Doprava', '2026-10-04'),
          expense('old', 5000, 'Bydlení', '2026-09-30'),
        ]}
        onCategoryClick={() => {}}
      />,
    )
    expect(html).toContain('Celkem 1 500,00 Kč')
    expect(html).toContain('Potraviny, 1 000,00 Kč, 67 procent')
    expect(html).toContain('Auto, 500,00 Kč, 33 procent')
    expect(html).not.toContain('Bydlení')
    expect(html).not.toContain('Doprava')
  })

  it('shows a truthful empty state when the period has no expenses', () => {
    const html = renderToStaticMarkup(
      <SpendingDonut today="2026-10-23" expenses={[expense('old', 5000, 'Bydlení', '2026-09-30')]} onCategoryClick={() => {}} />,
    )
    expect(html).toContain('V tomto období zatím nejsou žádné výdaje.')
    expect(html).not.toContain('role="img"')
  })
})
