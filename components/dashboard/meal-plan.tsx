import { useState } from 'react'
import { ArrowUpRight, CalendarDays, Check, PackageCheck, RefreshCw, ShoppingBasket, Sparkles, X } from 'lucide-react'
import { getMealPlanRecipePoolsAction, saveMealPlanAction } from '@/app/actions/meal-plan'
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
  const [loading, setLoading] = useState(false)
  const [recipePools, setRecipePools] = useState<Partial<Record<MealType, WeeklyMealPlan['days'][number]['breakfast'][]>>>({})
  const [selectedRecipe, setSelectedRecipe] = useState<NonNullable<WeeklyMealPlan['days'][number]['breakfast']> | null>(null)

  // The menu itself needs no budget: the budget is set afterwards, in the shopping panel below it.
  async function generate() {
    if (mealTypes.length === 0) {
      setError('Vyberte aspoň jeden chod.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const pools = await getMealPlanRecipePoolsAction()
      const usablePools = Object.fromEntries(
        mealTypes
          .map((mealType) => [mealType, pools[mealType] ?? []] as const)
          .filter(([, recipes]) => recipes.length > 0),
      ) as Partial<Record<MealType, NonNullable<WeeklyMealPlan['days'][number]['breakfast']>[]>>
      if (mealTypes.some((mealType) => (usablePools[mealType]?.length ?? 0) === 0)) {
        throw new Error('Pro některý zvolený chod nejsou v katalogu dostupné vhodné recepty.')
      }
      setRecipePools(usablePools)
      const limit = Number.isFinite(Number(budget)) && Number(budget) > 0 ? Number(budget) : 0
      const newPlan = generateWeeklyPlan(limit, household, useStock ? pantryItems : null, {
        dayCount,
        startDayIndex: startToday ? todayDayIndex() : 0,
        mealTypes,
        recipePools: usablePools,
      })
      setPlan(newPlan)
      setAdded(false)
      savePlan(limit, newPlan)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Jídelníček se nepodařilo vytvořit.')
    } finally {
      setLoading(false)
    }
  }

  function toggleMealType(type: MealType) {
    setMealTypes((current) => (current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type]))
  }

  async function regenerate(day: string, mealType: MealType) {
    if (!plan || loading) return
    setError(null)
    setLoading(true)
    try {
      const pools = Object.keys(recipePools).length > 0 ? recipePools : await getMealPlanRecipePoolsAction()
      setRecipePools(pools)
      const updated = generateWeeklyPlan(
        Number(budget) || 0,
        household,
        useStock ? pantryItems : null,
        {
          dayCount: plan.days.length,
          startDayIndex: Math.max(0, ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'].indexOf(plan.days[0]?.day ?? 'Pondělí')),
          mealTypes: [mealType],
          recipePools: pools,
        },
      )
      const replacement = updated.days[0]?.[RECIPE_BY_MEAL[mealType]]
      const current = plan.days.find((entry) => entry.day === day)?.[RECIPE_BY_MEAL[mealType]]
      if (!replacement || !current) return
      const swapped = {
        ...replacement,
        selectedServings: current.selectedServings ?? replacement.selectedServings,
      }
      const nextPlan = {
        ...plan,
        days: plan.days.map((entry) => entry.day === day ? { ...entry, [RECIPE_BY_MEAL[mealType]]: swapped } : entry),
      }
      setPlan(nextPlan)
      setAdded(false)
      savePlan(Number(budget), nextPlan)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Jiné jídlo se nepodařilo navrhnout.')
    } finally {
      setLoading(false)
    }
  }

  function changeServings(day: string, mealType: MealType, nextValue: number) {
    if (!plan || !Number.isFinite(nextValue) || nextValue < 0) return
    const updated: WeeklyMealPlan = {
      ...plan,
      days: plan.days.map((entry) => {
        if (entry.day !== day) return entry
        const slot = RECIPE_BY_MEAL[mealType]
        const recipe = entry[slot]
        if (!recipe) return entry
        return { ...entry, [slot]: { ...recipe, selectedServings: Math.round(nextValue * 10) / 10 } }
      }),
    }
    setPlan(updated)
    setAdded(false)
    savePlan(Number(budget) || 0, updated)
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
        <button onClick={() => void generate()} disabled={loading} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {loading ? 'Navrhuji…' : plan ? 'Vytvořit nový jídelníček' : 'Vytvořit jídelníček'}
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
                          <button
                            type="button"
                            onClick={() => setSelectedRecipe(recipe)}
                            className={`min-w-0 break-words text-right font-medium hover:text-primary hover:underline ${cooked ? 'text-muted-foreground line-through' : ''}`}
                            title="Otevřít detail receptu"
                          >
                            {recipe.name}
                          </button>
                          <button
                            type="button"
                            aria-label={`Jiný návrh: ${label}, ${day.day}`}
                            onClick={() => void regenerate(day.day, key)}
                            disabled={loading}
                            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-background hover:text-primary disabled:opacity-40"
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
                      <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                        <span>Porce</span>
                        <button
                          type="button"
                          aria-label={`Méně porcí: ${label}, ${day.day}`}
                          onClick={() => changeServings(day.day, key, Math.max(0, (recipe.selectedServings ?? 1) - 1))}
                          disabled={loading || (recipe.selectedServings ?? 1) <= 0}
                          className="h-6 w-6 rounded-full bg-background font-semibold disabled:opacity-40"
                        >−</button>
                        <input
                          aria-label={`Počet porcí: ${label}, ${day.day}`}
                          type="number"
                          min="0"
                          step="0.5"
                          value={recipe.selectedServings ?? 1}
                          onChange={(event) => changeServings(day.day, key, Number(event.target.value))}
                          className="w-12 rounded-md bg-background px-1 py-0.5 text-center text-[11px] font-medium text-foreground outline-none"
                        />
                        <button
                          type="button"
                          aria-label={`Více porcí: ${label}, ${day.day}`}
                          onClick={() => changeServings(day.day, key, (recipe.selectedServings ?? 1) + 1)}
                          disabled={loading}
                          className="h-6 w-6 rounded-full bg-background font-semibold disabled:opacity-40"
                        >+</button>
                        {recipe.servings === undefined && <span>množství se nepřepočítává</span>}
                      </div>
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

      {selectedRecipe && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={() => setSelectedRecipe(null)}
        >
          <article
            role="dialog"
            aria-modal="true"
            aria-labelledby="meal-plan-recipe-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{selectedRecipe.sourceName ?? 'Recept'}</p>
                <h3 id="meal-plan-recipe-title" className="mt-1 text-xl font-semibold">{selectedRecipe.name}</h3>
              </div>
              <button type="button" aria-label="Zavřít detail receptu" onClick={() => setSelectedRecipe(null)} className="rounded-lg p-2 hover:bg-muted">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {selectedRecipe.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedRecipe.imageUrl} alt="" className="mt-4 max-h-72 w-full rounded-xl object-cover" referrerPolicy="no-referrer" />
            )}
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{selectedRecipe.selectedServings ?? selectedRecipe.servings ?? '—'} porcí</span>
              {selectedRecipe.servings !== undefined && <span>základ receptu {selectedRecipe.servings} porce</span>}
            </div>
            <section className="mt-4">
              <h4 className="text-sm font-semibold">Suroviny</h4>
              <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                {selectedRecipe.ingredients.map((ingredient, index) => (
                  <li key={ingredient.name + index} className="flex items-start justify-between gap-4 px-3 py-2.5 text-sm">
                    <span>{ingredient.name}</span>
                    <span className="shrink-0 text-right text-muted-foreground">
                      {ingredient.sourceMeasure ?? `${ingredient.quantity} ${ingredient.unit}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            {selectedRecipe.sourceUrl && (
              <a href={selectedRecipe.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
                Otevřít celý recept <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
          </article>
        </div>
      )}
    </section>
  )
}
