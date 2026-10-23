import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BudgetHero } from '@/components/budget/budget-hero'

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/ /g, ' ')

describe('BudgetHero pace', () => {
  it('shows the daily allowance and the projected overrun', () => {
    const html = text(renderToStaticMarkup(<BudgetHero today="2026-09-25" budget={10000} spent={8640} remaining={1360} />))
    expect(html).toContain('Na den zbývá 227 Kč (6 dní do konce měsíce)')
    expect(html).toContain('Při tomto tempu překročíte limit o 368 Kč')
  })

  it('uses "dny" for two to four days and says nothing about an overrun within the limit', () => {
    const html = text(renderToStaticMarkup(<BudgetHero today="2026-09-27" budget={10000} spent={3000} remaining={7000} />))
    expect(html).toContain('(4 dny do konce měsíce)')
    expect(html).not.toContain('překročíte')
  })

  it('shows no pace without a date or once the limit is exceeded', () => {
    expect(text(renderToStaticMarkup(<BudgetHero budget={10000} spent={3000} remaining={7000} />))).not.toContain('Na den zbývá')
    expect(text(renderToStaticMarkup(<BudgetHero today="2026-09-25" budget={10000} spent={12000} remaining={-2000} />))).not.toContain('Na den zbývá')
  })

  it('shows real utilization above 100% while keeping the progress bar within its track', () => {
    const html = renderToStaticMarkup(<BudgetHero budget={10000} spent={12000} remaining={-2000} />)
    expect(text(html)).toContain('Rozpočet překročen o')
    expect(text(html)).toMatch(/2\s?000 Kč/)
    expect(text(html)).toContain('120 %')
    expect(html).toContain('aria-valuenow="100"')
    expect(html).toContain('aria-valuetext="120 % rozpočtu vyčerpáno"')
  })
})
