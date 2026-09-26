import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ExpenseLedger } from '@/components/budget/expense-ledger'
import type { Expense } from '@/lib/types'

const paid = (amount: number, category: Expense['category'], subcategory: string | null, date: string, note = ''): Expense => ({ id: `${date}-${amount}`, amount, note, category, subcategory, date, purchaseId: null })
const noop = () => {}

describe('ExpenseLedger', () => {
  it("opens on today's month with its total, categories and their subcategories", () => {
    const html = renderToStaticMarkup(
      <ExpenseLedger
        today="2026-09-26"
        expenses={[
          paid(12000, 'Bydlení', 'Nájem nebo hypotéka', '2026-09-01', 'Nájem září'),
          paid(1500, 'Auto', 'Palivo', '2026-09-03'),
          paid(800, 'Oblečení a obuv', 'Obuv', '2026-08-30'),
        ]}
        onAdd={noop}
        onEdit={noop}
      />,
    )
    expect(html).toContain('září 2026')
    expect(html).toContain('srpen 2026') // an older month to switch to
    expect(html).toContain('13 500,00 Kč')
    expect(html).toContain('Bydlení')
    expect(html).toContain('Nájem nebo hypotéka 12 000,00 Kč')
    expect(html).toContain('Auto')
    expect(html).not.toContain('Oblečení a obuv') // August's expense is not in September
  })

  it('says what to do when the month has no expenses', () => {
    const html = renderToStaticMarkup(<ExpenseLedger today="2026-10-02" expenses={[paid(800, 'Auto', null, '2026-09-30')]} onAdd={noop} onEdit={noop} />)
    expect(html).toContain('V tomto měsíci zatím žádné výdaje.')
    expect(html).toContain('Zapsat první výdaj')
  })
})
