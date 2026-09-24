import { useState } from 'react'
import { ArrowUpRight, CalendarDays, Check, PackageCheck, RefreshCw, ShoppingBasket, Sparkles } from 'lucide-react'
import { saveMealPlanAction } from '@/app/actions/meal-plan'
import { money } from '@/lib/format'
import {
  generateWeeklyPlan,
  isMealCooked,
  markMealCooked,
  regenerateMeal,
  splitIngredientsByStock,
  type Ingredient,
  type MealType,
  type WeeklyMealPlan,
} from '@/lib/meal-plans'
import type { SavedMealPlan } from '@/lib/db/queries'
import type { Household, PantryItem } from '@/lib/types'

const BUDGET_SUGGESTIONS = [2000, 2500, 3000]
const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: 'Snídaně', label: 'Snídaně' },
  { key: 'Oběd', label: 'Oběd' },
  { key: 'Večeře', label: 'Večeře' },
  { key: 'Svačina', label: 'Svačina' },
]
const RECIPE_BY_MEAL: Record<MealType, 'breakfast' | 'lunch' | 'dinner' | 'snack'> = {
  Snídaně: 'breakfast',
  Oběd: 'lunch',
  Večeře: 'dinner',
  Svačina: 'snack',
}

export function MealPlan({
  household,
  initialPlan,
  pantryItems,
  onAddIngredients,
  onMarkCooked,
}: {
  household: Household
  initialPlan: SavedMealPlan | null
  pantryItems: PantryItem[]
  onAddIngredients: (ingredients: Ingredient[]) => void
  onMarkCooked: (day: string, mealType: MealType) => void
}) {
  const [budget, setBudget] = useState(initialPlan ? String(initialPlan.budgetLimit) : '2500')
  const [plan, setPlan] = useState<WeeklyMealPlan | null>(initialPlan?.plan ?? null)
  const [useStock, setUseStock] = useState(false)
  const [added, setAdded] = useState(false)

  function generate(limit = Number(budget)) {
    if (!Number.isFinite(limit) || limit <= 0) return
    setBudget(String(limit))
    const newPlan = generateWeeklyPlan(limit, household, useStock ? pantryItems : null)
    setPlan(newPlan)
    setAdded(false)
    saveMealPlanAction(limit, newPlan)
  }

  function regenerate(day: string, mealType: MealType) {
    if (!plan) return
    const updated = regenerateMeal(plan, day, mealType, household, useStock ? pantryItems : null)
    setPlan(updated)
    setAdded(false)
    saveMealPlanAction(Number(budget), updated)
  }

  function markCooked(day: string, mealType: MealType) {
    if (!plan || isMealCooked(plan, day, mealType)) return
    setPlan(markMealCooked(plan, day, mealType)) // optimistic — server deducts the real pantry stock
    onMarkCooked(day, mealType)
  }

  function addAll() {
    if (!plan) return
    const { toBuy } = splitIngredientsByStock(plan, pantryItems)
    onAddIngredients(toBuy)
    setAdded(true)
  }

  const budgetLimit = Number(budget)
  const overBudget = plan ? plan.estimatedTotal > budgetLimit : false
  const stockSplit = plan ? splitIngredientsByStock(plan, pantryItems) : null

  return (
    <section className="surface p-5 sm:p-6">
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
        <label className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-muted-foreground">
          <input type="checkbox" checked={useStock} onChange={(event) => setUseStock(event.target.checked)} className="size-4 accent-primary" />
          Vytvořit ze zásob (spíž, lednice, mrazák)
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

          {stockSplit && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <PackageCheck className="h-3.5 w-3.5 text-primary" />
              Ze zásob: <span className="font-medium text-foreground">{stockSplit.fromStock.length}</span> položek · Ke koupi:{' '}
              <span className="font-medium text-foreground">{stockSplit.toBuy.length}</span> položek
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {plan.days.map((day) => (
              <div key={day.day} className="rounded-2xl bg-muted p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  <CalendarDays className="h-3.5 w-3.5" /> {day.day}
                </p>
                <dl className="mt-3 space-y-1.5 text-xs">
                  {MEAL_TYPES.map(({ key, label }) => {
                    const recipe = day[RECIPE_BY_MEAL[key]]
                    const cooked = isMealCooked(plan, day.day, key)
                    return (
                      <div key={key} className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="flex min-w-0 items-center gap-1">
                          <span className={`truncate text-right font-medium ${cooked ? 'text-muted-foreground line-through' : ''}`}>{recipe.name}</span>
                          <button
                            aria-label={`Jiný návrh: ${label}, ${day.day}`}
                            onClick={() => regenerate(day.day, key)}
                            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-background hover:text-primary"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </button>
                          <button
                            aria-label={cooked ? `Uvařeno: ${label}, ${day.day}` : `Označit jako uvařeno: ${label}, ${day.day}`}
                            onClick={() => markCooked(day.day, key)}
                            disabled={cooked}
                            className={`shrink-0 rounded-md p-1 ${cooked ? 'text-primary' : 'text-muted-foreground hover:bg-background hover:text-primary'}`}
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              </div>
            ))}
          </div>

          <button onClick={addAll} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
            <ShoppingBasket className="h-4 w-4" />
            {added ? 'Přidáno do nákupního seznamu' : 'Přidat chybějící do nákupního seznamu'}
            {!added && <ArrowUpRight className="h-4 w-4" />}
          </button>
        </div>
      )}
    </section>
  )
}
