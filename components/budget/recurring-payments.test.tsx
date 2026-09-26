import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RecurringPayments } from '@/components/budget/recurring-payments'
import type { RecurringPayment } from '@/lib/recurring-payments'

const payment = (overrides: Partial<RecurringPayment> = {}): RecurringPayment => ({
  id: 'rent',
  name: 'Nájem',
  category: 'Bydlení',
  subcategory: 'Nájem nebo hypotéka',
  amount: 12000,
  intervalMonths: 1,
  startDate: '2026-08-15',
  active: true,
  ...overrides,
})
const noop = async () => {}

describe('RecurringPayments', () => {
  it('shows what waits for confirmation, what comes next and every payment', () => {
    const html = renderToStaticMarkup(
      <RecurringPayments
        payments={[payment(), payment({ id: 'car', name: 'Povinné ručení', category: 'Auto', subcategory: 'Povinné ručení', amount: 4200, intervalMonths: 12, startDate: '2026-10-10' })]}
        occurrences={[{ recurringPaymentId: 'rent', dueDate: '2026-08-15', status: 'paid' }]}
        today="2026-09-26"
        onAdd={noop}
        onEdit={noop}
        onConfirm={noop}
        onSkip={noop}
      />,
    )
    expect(html).toContain('K potvrzení')
    expect(html).toContain('Splatné 15. 9.')
    expect(html).toContain('Zaplaceno')
    expect(html).toContain('Přeskočit')
    expect(html).toContain('Brzy splatné')
    expect(html).toContain('10. 10.') // the insurance, due in two weeks
    expect(html).toContain('ročně')
  })

  it('explains what to do without any payment', () => {
    const html = renderToStaticMarkup(<RecurringPayments payments={[]} occurrences={[]} today="2026-09-26" onAdd={noop} onEdit={noop} onConfirm={noop} onSkip={noop} />)
    expect(html).toContain('Zatím žádné.')
  })
})
