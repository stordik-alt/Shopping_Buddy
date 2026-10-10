import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BudgetPeriodSettings } from '@/components/budget/budget-period-settings'
import type { PeriodConfig } from '@/lib/budget-period'

const noop = async () => {}
const render = (period: PeriodConfig) => renderToStaticMarkup(<BudgetPeriodSettings period={period} today="2026-10-20" onSave={noop} />)

describe('BudgetPeriodSettings', () => {
  it('offers the three kinds and selects the current one', () => {
    const html = render({ type: 'calendar' })
    expect(html).toContain('Kalendářní měsíc')
    expect(html).toContain('Od výplaty')
    expect(html).toContain('Vlastní období')
    expect(html).not.toContain('Délka v dnech')
    expect(html).not.toContain('Období začíná')
  })

  it('asks for the day of the month for a payday period', () => {
    const html = render({ type: 'payday', startDay: 15 })
    expect(html).toContain('Období začíná')
    expect(html).toContain('15. dne v měsíci')
    expect(html).not.toContain('Délka v dnech')
  })

  it('asks for a start date and a length for a custom period, with the saved values', () => {
    const html = render({ type: 'custom', anchor: '2026-01-05', lengthDays: 14 })
    expect(html).toContain('První den období')
    expect(html).toContain('Délka v dnech')
    expect(html).toContain('2026-01-05')
    expect(html).toContain('value="14"')
  })

  it('treats a payday on the 1st as the calendar month and has nothing to save yet', () => {
    const html = render({ type: 'payday', startDay: 1 })
    expect(html).toContain('<option value="calendar" selected="">')
    // Unchanged: the save button is disabled and no "change" explanation is shown.
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Uložit období/)
    expect(html).not.toContain('přepočítá přehledy')
  })
})
