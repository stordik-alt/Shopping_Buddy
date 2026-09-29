import { useState } from 'react'
import { ArrowUpRight, CalendarDays, Check, PackageCheck, RefreshCw, ShoppingBasket, Sparkles } from 'lucide-react'
import { saveMealPlanAction } from '@/app/actions/meal-plan'
import { money } from '@/lib/format'
import {
  ALL_MEAL_TYPES,
  generateWeeklyPlan,
  isMealCooked,
  markMealCooked,
  mealTypesOf,
  missingIngredients,
  recommendStores,
  regenerateMeal,
  splitIngredientsByStock,
  type Ingredient,
  type MealType,
  type WeeklyMealPlan,
} from '@/lib/meal-plans'
import type { SavedMealPlan } from '@/lib/db/queries'
import type { Household, PantryItem } from '@/lib/types'

const BUDGET_SUGGESTIONS = [2000, 2500, 3000]
const MEAL_TYPES: { key: MealType; label: string }[] = ALL_MEAL_TYPES.map((key) => ({ key, label: key }))
const DAY_COUNTS = [1, 2, 3, 4, 5, 6, 7]

// Index of today's weekday, 0 = Monday (the same order as DAYS in lib/meal-plans.ts).
function todayDayIndex(): number {
  return (new Date().getDay() + 6) % 7
}
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
  onPlanSaved,
}: {
  household: Household
  initialPlan: SavedMealPlan | null
  pantryItems: PantryItem[]
  onAddIngredients: (ingredients: Ingredient[]) => void
  onMarkCooked: (day: string, mealType: MealType) => void
  /** Lets the parent keep the saved plan, so it is still there when this card is shown again. */
  onPlanSaved: (budgetLimit: number, plan: WeeklyMealPlan) => void
}) {
  function savePlan(limit: number, updated: WeeklyMealPlan) {
    onPlanSaved(limit, updated)
    saveMealPlanAction(limit, updated)
  }

  const [budget, setBudget] = useState(initialPlan ? String(initialPlan.budgetLimit) : '2500')
  const [plan, setPlan] = useState<WeeklyMealPlan | null>(initialPlan?.plan ?? null)
  const [useStock, setUseStock] = useState(false)
  const [added, setAdded] = useState(false)
  const [dayCount, setDayCount] = useState(initialPlan?.plan.days.length ?? 7)
  const [mealTypes, setMealTypes] = useState<MealType[]>(initialPlan ? mealTypesOf(initialPlan.plan) : ALL_MEAL_TYPES)
  const [startToday, setStartToday] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The menu itself needs no budget: the budget is set afterwards, in the shopping panel below it.
  function generate() {
    if (mealTypes.length === 0) {
      setError('Vyberte aspoň jeden chod.')
      return
    }
    setError(null)
    const limit = Number.isFinite(Number(budget)) && Number(budget) > 0 ? Number(budget) : 0
    const newPlan = generateWeeklyPlan(limit, household, useStock ? pantryItems : null, {
      dayCount,
      startDayIndex: startToday ? todayDayIndex() : 0,
      mealTypes,
    })
    setPlan(newPlan)
    setAdded(false)
    savePlan(limit, newPlan)
  }

  function toggleMealType(type: MealType) {
    setMealTypes((current) => (current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type]))
  }

  function regenerate(day: string, mealType: MealType) {
    if (!plan) return
    const updated = regenerateMeal(plan, day, mealType, household, useStock ? pantryItems : null)
    setPlan(updated)
    setAdded(false)
    savePlan(Number(budget), updated)
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

  // A budget the household types or picks is only compared with the menu's estimated price.
  function changeBudget(value: string) {
    setBudget(value)
    const limit = Number(value)
    if (plan && Number.isFinite(limit) && limit > 0) {
      const updated = { ...plan, recommendedStores: recommendStores(plan.estimatedTotal, limit, household) }
      setPlan(updated)
      savePlan(limit, updated)
    }
  }

  const budgetLimit = Number(budget)
  const overBudget = plan && budgetLimit > 0 ? plan.estimatedTotal > budgetLimit : false
  const stockSplit = plan ? splitIngredientsByStock(plan, pantryItems) : null

  return (
    <section className="surface p-5 sm:p-6">
      <div>
        <p className="text-sm font-semibold">Jídelníček a nákup</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Zvolte období a chody. U každého jídla uvidíte, co v zásobách chybí, a můžete to přidat do nákupního seznamu.
        </p>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 text-sm">
          Počet dnů
          <select aria-label="Počet dnů jídelníčku" value={dayCount} onChange={(event) => setDayCount(Number(event.target.value))} className="bg-transparent outline-none">
            {DAY_COUNTS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 text-sm">
          Začít
          <select aria-label="Začátek jídelníčku" value={startToday ? 'today' : 'monday'} onChange={(event) => setStartToday(event.target.value === 'today')} className="bg-transparent outline-none">
            <option value="monday">od pondělí</option>
            <option value="today">dnes</option>
          </select>
        </label>
      </div>
      <div role="group" aria-label="Chody" className="mt-2 flex flex-wrap items-center gap-2">
        {MEAL_TYPES.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 text-sm">
            <input type="checkbox" checked={mealTypes.includes(key)} onChange={() => toggleMealType(key)} className="size-4 accent-primary" />
            {label}
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-muted-foreground">
          <input type="checkbox" checked={useStock} onChange={(event) => setUseStock(event.target.checked)} className="size-4 accent-primary" />
          Vytvořit ze zásob (spíž, lednice, mrazák)
        </label>
        <button onClick={() => generate()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
          {plan ? 'Vytvořit nový jídelníček' : 'Vytvořit jídelníček'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {plan && (
        <div className="mt-6 space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {plan.days.map((day) => (
              <div key={day.day} className="rounded-2xl bg-muted p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  <CalendarDays className="h-3.5 w-3.5" /> {day.day}
                </p>
                <dl className="mt-3 space-y-1.5 text-xs">
                  {MEAL_TYPES.map(({ key, label }) => {
                    const recipe = day[RECIPE_BY_MEAL[key]]
                    if (!recipe) return null
                    const cooked = isMealCooked(plan, day.day, key)
                    const missing = cooked ? [] : missingIngredients(recipe, pantryItems)
                    return (
                      <div key={key}>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="flex min-w-0 items-center gap-1">
                          <span className={`min-w-0 break-words text-right font-medium ${cooked ? 'text-muted-foreground line-through' : ''}`}>{recipe.name}</span>
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
                      {missing.length > 0 && (
                        <p className="mt-0.5 break-words text-right text-xs text-destructive">Chybí: {missing.map((ingredient) => ingredient.name).join(', ')}</p>
                      )}
                      {!cooked && missing.length === 0 && <p className="mt-0.5 text-right text-xs text-primary">Vše ze zásob</p>}
                      </div>
                    )
                  })}
                </dl>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-2xl bg-muted p-4">
            <p className="text-sm font-semibold">Nákup na tento jídelníček</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 text-sm">
                Rozpočet
                <input
                  aria-label="Rozpočet na nákup"
                  type="number"
                  min="0"
                  value={budget}
                  onChange={(event) => changeBudget(event.target.value)}
                  className="w-20 bg-transparent outline-none"
                />
                Kč
              </label>
              {BUDGET_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => changeBudget(String(suggestion))}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-background"
                >
                  {suggestion.toLocaleString('cs-CZ')} Kč
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>
                Odhadovaná cena nákupu: <span className="font-semibold">{money(plan.estimatedTotal)}</span>
              </span>
              {budgetLimit > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${overBudget ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                  {overBudget ? 'Nad rozpočtem' : 'V rozpočtu'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              Doporučené obchody:
              {plan.recommendedStores.map((store) => (
                <span key={store} className="rounded-full bg-background px-2 py-1 font-medium">
                  {store}
                </span>
              ))}
            </div>
            {stockSplit && (
              <div className="text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5">
                  <PackageCheck className="h-3.5 w-3.5 text-primary" />
                  Ze zásob: <span className="font-medium text-foreground">{stockSplit.fromStock.length}</span> položek · Ke koupi:{' '}
                  <span className="font-medium text-foreground">{stockSplit.toBuy.length}</span> položek
                </p>
                {stockSplit.toBuy.length > 0 && (
                  <p className="mt-1 break-words">Chybí: {stockSplit.toBuy.map((ingredient) => `${ingredient.name} (${ingredient.quantity} ${ingredient.unit})`).join(', ')}</p>
                )}
              </div>
            )}
            <button onClick={addAll} disabled={stockSplit?.toBuy.length === 0} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
              <ShoppingBasket className="h-4 w-4" />
              {added ? 'Přidáno do nákupního seznamu' : 'Přidat chybějící do nákupního seznamu'}
              {!added && <ArrowUpRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
