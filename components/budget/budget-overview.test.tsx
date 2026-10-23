import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { BudgetOverview } from '@/components/budget/budget-overview'
import type { Expense } from '@/lib/types'

vi.mock('@/app/actions/refresh', () => ({ refreshPurchaseSavingsAction: vi.fn(async () => []) }))

const expense = (amount: number, date: string, category: Expense['category'] = 'Potraviny'): Expense => ({
  id: `${date}-${category}-${amount}`,
  amount,
  note: 'Nákup',
  category,
  subcategory: null,
  date,
  purchaseId: null,
})

function overview({
  today = '2026-10-23',
  period = 1,
  budget = 10000,
  expenses = [],
}: {
  today?: string
  period?: number | { type: 'calendar' } | { type: 'payday'; startDay: number }
  budget?: number
  expenses?: Expense[]
} = {}) {
  return renderToStaticMarkup(
    <BudgetOverview
      today={today}
      period={period}
      budget={budget}
      onEditBudget={() => {}}
      expenses={expenses}
      items={[]}
      purchases={[]}
      onExpense={() => {}}
      onCategoryClick={() => {}}
    />,
  )
}

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ').replace(/&nbsp;/g, ' ')

describe('BudgetOverview', () => {
  it('shows the whole remaining amount as daily and weekly pace on the last day', () => {
    const html = text(overview({ today: '2026-10-31', budget: 5000 }))
    expect(html).toContain('Zbývá v rozpočtu')
    expect(html).toContain('5 000 Kč')
    expect(html.match(/5 000 Kč/g)).toHaveLength(5) // remaining, daily, weekly, limit and projected reserve
    expect(html).toContain('V tomto období zatím nejsou žádné výdaje.')
  })

  it('uses the configured running period for the recommendations and updates their values', () => {
    const expenses = [expense(1000, '2026-10-22')]
    const calendar = text(overview({ expenses, budget: 10000 }))
    const payday = text(overview({ expenses, budget: 10000, period: { type: 'payday', startDay: 15 } }))
    expect(calendar).toContain('1 000 Kč') // 9 000 Kč / 9 days
    expect(payday).toContain('391 Kč') // 9 000 Kč / 23 days
    expect(calendar).not.toBe(payday)
  })

  it('states the overrun in words and never offers negative spending', () => {
    const html = text(overview({ budget: 1000, expenses: [expense(1200, '2026-10-22')] }))
    expect(html).toContain('Rozpočet překročen o')
    expect(html).toContain('Překročeno o 200,00 Kč')
    expect(html).toContain('120 %')
    expect(html).toContain('kladná útrata se nedoporučuje')
  })

  it('shows a missing-limit state and does not invent an allowance', () => {
    const html = text(overview({ budget: 0, expenses: [expense(250, '2026-10-22')] }))
    expect(html).toContain('Nastavte si rozpočtový limit')
    expect(html).toContain('Chybí rozpočtový limit')
    expect(html).not.toContain('Na den zbývá')
    expect(html).not.toContain('Na týden zbývá')
  })
})
