import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BudgetHero } from '@/components/budget/budget-hero'
import { DashboardOverview } from '@/components/dashboard/dashboard-overview'
import { TodayMeals } from '@/components/dashboard/today-meals'
import { PantryCheckCard } from '@/components/dashboard/pantry-check-card'
import type { Recipe } from '@/lib/meal-plans'

// A <button> may hold phrasing content only; block elements inside it are invalid HTML.
const BLOCK_IN_BUTTON = /<button[^>]*>(?:(?!<\/button>)[\s\S])*<(div|p|h[1-6]|ul|li|section)[\s>]/

describe('BudgetHero', () => {
  it('is one tap target with only phrasing content when it can be opened', () => {
    const html = renderToStaticMarkup(<BudgetHero budget={10000} spent={8500} remaining={1500} onOpen={() => {}} compact />)
    expect(html).toMatch(/^<button type="button"/)
    expect(html).not.toMatch(BLOCK_IN_BUTTON)
    expect(html).toContain('Přes 80 % limitu')
    expect(html).toContain('aria-valuenow="85"')
  })

  it('stays a plain card without onOpen, and offers to set a missing budget', () => {
    expect(renderToStaticMarkup(<BudgetHero budget={10000} spent={0} remaining={10000} />)).toMatch(/^<div/)
    expect(renderToStaticMarkup(<BudgetHero budget={0} spent={0} remaining={0} onSetBudget={() => {}} onOpen={() => {}} />)).toContain('Nastavit rozpočet')
  })
})

describe('DashboardOverview', () => {
  it('renders the shopping-list card as a valid button with progress', () => {
    const html = renderToStaticMarkup(
      <DashboardOverview today="2026-10-04" budget={10000} spent={2000} remaining={8000} completed={1} totalItems={4} pendingNames={['Mléko', 'Chléb', 'Vejce']} onBudget={() => {}} onShopping={() => {}} onExpense={() => {}} onReceipt={() => {}} onStores={() => {}} onSetBudget={() => {}} />,
    )
    expect(html).not.toMatch(BLOCK_IN_BUTTON)
    expect(html).toContain('aria-label="Postup nákupu"')
    expect(html).toContain('Mléko')
  })
})

describe('TodayMeals', () => {
  const recipe = (name: string) => ({ id: name, name, mealType: 'Oběd', price: 0, allergens: [], ingredients: [] }) as Recipe

  it("lists today's meals, each its own tap target, and marks the cooked one", () => {
    const html = renderToStaticMarkup(
      <TodayMeals
        meals={[
          { day: 'Neděle', mealType: 'Oběd', recipe: recipe('Svíčková'), cooked: true },
          { day: 'Neděle', mealType: 'Večeře', recipe: recipe('Rizoto'), cooked: false },
        ]}
        onOpen={() => {}}
        onOpenMeal={() => {}}
      />,
    )
    expect(html).toContain('Dnes vaříme')
    expect(html).toContain('Svíčková')
    // The heading plus one button per meal.
    expect(html.match(/<button/g)).toHaveLength(3)
    expect(html).toContain('aria-label="uvařeno"')
    expect(html).not.toMatch(BLOCK_IN_BUTTON)
  })

  it('is a single quiet line without a plan for today', () => {
    expect(renderToStaticMarkup(<TodayMeals meals={[]} onOpen={() => {}} onOpenMeal={() => {}} />)).toContain('na dnešek nic naplánováno')
  })
})

describe('PantryCheckCard', () => {
  it('shows only the count and the way into the check, no item list', () => {
    const html = renderToStaticMarkup(<PantryCheckCard toCheck={3} onCheck={() => {}} onOpen={() => {}} />)
    expect(html).toContain('3 položky čekají')
    expect(html).toContain('Zkontrolovat zásoby')
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).not.toContain('<input')
  })

  it('is one quiet line to Zásoby when nothing waits', () => {
    const html = renderToStaticMarkup(<PantryCheckCard toCheck={0} onCheck={() => {}} onOpen={() => {}} />)
    expect(html).toContain('nic ke kontrole')
    expect(html).not.toContain('Zkontrolovat zásoby')
  })
})
