import { useState } from 'react'
import { ArrowUpRight, CalendarDays, ShoppingBasket, Sparkles } from 'lucide-react'
import { saveMealPlanAction } from '@/app/actions/meal-plan'
import { money } from '@/lib/format'
import { generateWeeklyPlan, planIngredients, type Ingredient, type WeeklyMealPlan } from '@/lib/meal-plans'
import type { SavedMealPlan } from '@/lib/db/queries'
import type { Household } from '@/lib/types'

const BUDGET_SUGGESTIONS = [2000, 2500, 3000]

export function MealPlan({
  household,
  initialPlan,
  onAddIngredients,
}: {
  household: Household
  initialPlan: SavedMealPlan | null
  onAddIngredients: (ingredients: Ingredient[]) => void
}) {
  const [budget, setBudget] = useState(initialPlan ? String(initialPlan.budgetLimit) : '2500')
  const [plan, setPlan] = useState<WeeklyMealPlan | null>(initialPlan?.plan ?? null)
  const [added, setAdded] = useState(false)

  function generate(limit = Number(budget)) {
    if (!Number.isFinite(limit) || limit <= 0) return
    setBudget(String(limit))
    const newPlan = generateWeeklyPlan(limit, household)
    setPlan(newPlan)
    setAdded(false)
    saveMealPlanAction(limit, newPlan)
  }

  function addAll() {
    if (!plan) return
    onAddIngredients(planIngredients(plan))
    setAdded(true)
  }

  const budgetLimit = Number(budget)
  const overBudget = plan ? plan.estimatedTotal > budgetLimit : false

  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Plán jídel a nákupu na týden</p>
          <p className="mt-1 text-sm text-muted-foreground">Naplánuj nám nákup na příští týden do 2 500 Kč.</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 text-sm">
          Rozpočet
          <input
            aria-label="Rozpočet na týdenní nákup"
            type="number"
            min="0"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) generate()
            }}
            className="w-20 bg-transparent outline-none"
          />
          Kč
        </label>
        <button onClick={() => generate()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
          Naplánovat nákup
        </button>
        {BUDGET_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => generate(suggestion)}
            className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted"
          >
            {suggestion.toLocaleString('cs-CZ')} Kč
          </button>
        ))}
      </div>

      {plan && (
        <div className="mt-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted p-4">
            <div className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>
                Odhadovaná cena nákupu: <span className="font-semibold">{money(plan.estimatedTotal)}</span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${overBudget ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                {overBudget ? 'Nad rozpočtem' : 'V rozpočtu'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Doporučené obchody:
              {plan.recommendedStores.map((store) => (
                <span key={store} className="rounded-full bg-background px-2 py-1 font-medium">
                  {store}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {plan.days.map((day) => (
              <div key={day.day} className="rounded-2xl bg-muted p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  <CalendarDays className="h-3.5 w-3.5" /> {day.day}
                </p>
                <dl className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Snídaně</dt>
                    <dd className="text-right font-medium">{day.breakfast.name}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Oběd</dt>
                    <dd className="text-right font-medium">{day.lunch.name}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Večeře</dt>
                    <dd className="text-right font-medium">{day.dinner.name}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Svačina</dt>
                    <dd className="text-right font-medium">{day.snack.name}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          <button onClick={addAll} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
            <ShoppingBasket className="h-4 w-4" />
            {added ? 'Přidáno do nákupního seznamu' : 'Přidat vše do nákupního seznamu'}
            {!added && <ArrowUpRight className="h-4 w-4" />}
          </button>
        </div>
      )}
    </section>
  )
}
