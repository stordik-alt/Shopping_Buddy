import { useState } from 'react'
import { ArrowUpRight, CalendarDays, Check, ChevronDown, PackageCheck, RefreshCw, ShoppingBasket, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
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
  plannedRecipeIngredients,
  type Ingredient,
  type Recipe as MealPlanRecipe,
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
  initialMeal = null,
}: {
  household: Household
  initialPlan: SavedMealPlan | null
  pantryItems: PantryItem[]
  onAddIngredients: (ingredients: Ingredient[]) => void
  onMarkCooked: (day: string, mealType: MealType) => void
  /** Lets the parent keep the saved plan, so it is still there when this card is shown again. */
  onPlanSaved: (budgetLimit: number, plan: WeeklyMealPlan) => void
  /** A meal to open straight away (a tap on it in "Dnes vaříme" on Domů). */
  initialMeal?: { day: string; mealType: MealType } | null
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
  const [recipePools, setRecipePools] = useState<Partial<Record<MealType, MealPlanRecipe[]>>>({})
  const [selectedMeal, setSelectedMeal] = useState<{ day: string; mealType: MealType } | null>(initialMeal)

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
      ) as Partial<Record<MealType, MealPlanRecipe[]>>
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
      const nextPlan = regenerateMeal(plan, day, mealType, household, useStock ? pantryItems : null, pools)
      if (nextPlan === plan) {
        setError('Pro tento typ jídla už není k dispozici jiný recept.')
        return
      }
      setPlan(nextPlan)
      setAdded(false)
      savePlan(Number(budget) || 0, nextPlan)
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
    if (plan && !plan.pricingPending && Number.isFinite(limit) && limit > 0) {
      const updated = { ...plan, recommendedStores: recommendStores(plan.estimatedTotal, limit, household) }
      setPlan(updated)
      savePlan(limit, updated)
    }
  }

  const budgetLimit = Number(budget)
  const overBudget = plan && !plan.pricingPending && budgetLimit > 0 ? plan.estimatedTotal > budgetLimit : false
  const stockSplit = plan ? splitIngredientsByStock(plan, pantryItems) : null

  // The meal opened in the detail sheet, by its place in the plan — read from `plan` on every render,
  // so servings changed or a meal swapped inside the sheet show at once.
  const selectedRecipe = selectedMeal && plan ? plan.days.find((entry) => entry.day === selectedMeal.day)?.[RECIPE_BY_MEAL[selectedMeal.mealType]] ?? null : null
  const selectedCooked = selectedMeal && plan ? isMealCooked(plan, selectedMeal.day, selectedMeal.mealType) : false
  const selectedRecipeIngredients = selectedRecipe ? plannedRecipeIngredients(selectedRecipe) : []
  const optionClass = 'flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm'

  return (
    <section className="surface p-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold">Jídelníček a nákup</h2>
        <p className="mt-1 text-sm text-fg-secondary">
          Zvolte období a chody. U každého jídla uvidíte, co v zásobách chybí, a můžete to přidat do nákupního seznamu.
        </p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Počet dnů</span>
          <Select aria-label="Počet dnů jídelníčku" value={dayCount} onChange={(event) => setDayCount(Number(event.target.value))}>
            {DAY_COUNTS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </Select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Začít</span>
          <Select aria-label="Začátek jídelníčku" value={startToday ? 'today' : 'monday'} onChange={(event) => setStartToday(event.target.value === 'today')}>
            <option value="monday">od pondělí</option>
            <option value="today">dnes</option>
          </Select>
        </label>
      </div>
      <div role="group" aria-label="Chody" className="mt-3 flex flex-wrap items-center gap-2">
        {MEAL_TYPES.map(({ key, label }) => (
          <label key={key} className={optionClass}>
            <input type="checkbox" checked={mealTypes.includes(key)} onChange={() => toggleMealType(key)} className="size-5 accent-[var(--accent-solid)]" />
            {label}
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className={optionClass}>
          <input type="checkbox" checked={useStock} onChange={(event) => setUseStock(event.target.checked)} className="size-5 accent-[var(--accent-solid)]" />
          Vytvořit ze zásob (spíž, lednice, mrazák)
        </label>
        <Button size="lg" onClick={() => void generate()} disabled={loading}>
          {loading ? 'Navrhuji…' : plan ? 'Vytvořit nový jídelníček' : 'Vytvořit jídelníček'}
        </Button>
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
              <div key={day.day} className="rounded-2xl bg-muted p-3">
                <h3 className="flex items-center gap-1.5 px-1 text-sm font-semibold text-accent-text">
                  <CalendarDays className="size-4" aria-hidden="true" /> {day.day}
                </h3>
                {/* One row per meal: name (opens the detail with servings and "Jiný návrh"), its
                    state in words, and the one frequent action — "Uvařeno". */}
                <ul className="mt-2 space-y-1">
                  {MEAL_TYPES.map(({ key, label }) => {
                    const recipe = day[RECIPE_BY_MEAL[key]]
                    if (!recipe) return null
                    const cooked = isMealCooked(plan, day.day, key)
                    const missing = cooked ? [] : missingIngredients(recipe, pantryItems)
                    return (
                      <li key={key} className="flex items-center gap-1 rounded-xl bg-card">
                        <button
                          type="button"
                          onClick={() => setSelectedMeal({ day: day.day, mealType: key })}
                          className="min-h-12 min-w-0 flex-1 rounded-xl px-3 py-2 text-left hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="block text-xs text-fg-muted">{label}</span>
                          <span className={`block break-words text-sm font-medium ${cooked ? 'text-fg-muted line-through' : ''}`}>{recipe.name}</span>
                          <span className={`mt-0.5 block text-xs ${cooked ? 'text-success' : missing.length > 0 ? 'text-warning' : 'text-success'}`}>
                            {cooked ? 'Uvařeno' : missing.length > 0 ? `Chybí: ${missing.map((ingredient) => ingredient.name).join(', ')}` : 'Vše ze zásob'}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={cooked ? `Uvařeno: ${label}, ${day.day}` : `Označit jako uvařeno: ${label}, ${day.day}`}
                          aria-pressed={cooked}
                          onClick={() => markCooked(day.day, key)}
                          disabled={cooked}
                          className={`icon-button mr-1 shrink-0 ${cooked ? '!text-success' : 'hover:!bg-success-subtle hover:!text-success'}`}
                        >
                          <Check className="size-5" aria-hidden="true" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-2xl bg-muted p-4">
            <h3 className="text-sm font-semibold">Nákup na tento jídelníček</h3>
            <div className="flex flex-wrap items-center gap-2">
              <label className={optionClass}>
                Rozpočet
                <input
                  aria-label="Rozpočet na nákup"
                  type="number"
                  min="0"
                  value={budget}
                  onChange={(event) => changeBudget(event.target.value)}
                  className="w-20 bg-transparent text-base outline-none"
                />
                Kč
              </label>
              {BUDGET_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => changeBudget(String(suggestion))}
                  className="min-h-10 rounded-full border border-border px-3 text-sm text-fg-secondary transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {suggestion.toLocaleString('cs-CZ')} Kč
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Sparkles className="size-4 text-accent-text" aria-hidden="true" />
              <span>
                {plan.pricingPending
                  ? <>Odhad ceny receptů zatím není dostupný.</>
                  : <>Odhadovaná cena nákupu: <span className="font-semibold">{money(plan.estimatedTotal)}</span></>}
              </span>
              {budgetLimit > 0 && !plan.pricingPending && <Badge tone={overBudget ? 'danger' : 'success'}>{overBudget ? 'Nad rozpočtem' : 'V rozpočtu'}</Badge>}
            </div>
            {!plan.pricingPending && (
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-fg-secondary">
                <span>Doporučené obchody:</span>
                {plan.recommendedStores.map((store) => (
                  <Badge key={store} className="bg-background">
                    {store}
                  </Badge>
                ))}
              </div>
            )}
            {stockSplit && (
              <div className="text-sm text-fg-secondary">
                <p className="flex items-center gap-1.5">
                  <PackageCheck className="size-4 text-accent-text" aria-hidden="true" />
                  Ze zásob: <span className="font-medium text-foreground">{stockSplit.fromStock.length}</span> položek · Ke koupi:{' '}
                  <span className="font-medium text-foreground">{stockSplit.toBuy.length}</span> položek
                </p>
                {stockSplit.toBuy.length > 0 && (
                  <details className="group mt-1">
                    <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1 rounded-lg font-medium text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                      Zobrazit, co chybí ({stockSplit.toBuy.length}) <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <p className="mt-1 break-words text-xs">{stockSplit.toBuy.map((ingredient) => `${ingredient.name} (${ingredient.quantity} ${ingredient.unit})`).join(', ')}</p>
                  </details>
                )}
              </div>
            )}
            <Button size="lg" onClick={addAll} disabled={stockSplit?.toBuy.length === 0}>
              <ShoppingBasket aria-hidden="true" />
              {added ? 'Přidáno do nákupního seznamu' : 'Přidat chybějící do nákupního seznamu'}
            </Button>
          </div>
        </div>
      )}

      <Sheet
        open={selectedRecipe != null}
        onClose={() => setSelectedMeal(null)}
        title={selectedRecipe?.name ?? 'Recept'}
        description={selectedMeal ? `${selectedMeal.mealType}, ${selectedMeal.day}${selectedRecipe?.sourceName ? ` · ${selectedRecipe.sourceName}` : ''}` : undefined}
        className="sm:max-w-2xl"
        footer={
          selectedMeal && selectedRecipe ? (
            <div className="flex flex-wrap gap-2">
              <Button size="lg" className="flex-1" onClick={() => markCooked(selectedMeal.day, selectedMeal.mealType)} disabled={selectedCooked}>
                <Check aria-hidden="true" /> {selectedCooked ? 'Uvařeno' : 'Označit jako uvařeno'}
              </Button>
              <Button variant="outline" size="lg" className="flex-1" onClick={() => void regenerate(selectedMeal.day, selectedMeal.mealType)} disabled={loading}>
                <RefreshCw aria-hidden="true" /> Jiný návrh
              </Button>
            </div>
          ) : undefined
        }
      >
        {selectedMeal && selectedRecipe && (
          <div className="space-y-4">
            {selectedRecipe.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- external recipe images; next/image would need every host allow-listed
              <img src={selectedRecipe.imageUrl} alt="" className="max-h-72 w-full rounded-xl object-cover" referrerPolicy="no-referrer" />
            )}
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted p-3">
              <span className="text-sm font-medium">Porce</span>
              <button
                type="button"
                aria-label={`Méně porcí: ${selectedMeal.mealType}, ${selectedMeal.day}`}
                onClick={() => changeServings(selectedMeal.day, selectedMeal.mealType, Math.max(0, (selectedRecipe.selectedServings ?? 1) - 1))}
                disabled={loading || (selectedRecipe.selectedServings ?? 1) <= 0}
                className="flex size-11 items-center justify-center rounded-full bg-card text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              >
                −
              </button>
              <input
                aria-label={`Počet porcí: ${selectedMeal.mealType}, ${selectedMeal.day}`}
                type="number"
                min="0"
                step="0.5"
                value={selectedRecipe.selectedServings ?? 1}
                onChange={(event) => changeServings(selectedMeal.day, selectedMeal.mealType, Number(event.target.value))}
                className="h-11 w-16 rounded-xl border border-input bg-background text-center text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              <button
                type="button"
                aria-label={`Více porcí: ${selectedMeal.mealType}, ${selectedMeal.day}`}
                onClick={() => changeServings(selectedMeal.day, selectedMeal.mealType, (selectedRecipe.selectedServings ?? 1) + 1)}
                disabled={loading}
                className="flex size-11 items-center justify-center rounded-full bg-card text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              >
                +
              </button>
              <span className="text-sm text-fg-muted">
                {selectedRecipe.servings !== undefined ? `základ receptu ${selectedRecipe.servings} porce` : 'množství se nepřepočítává'}
              </span>
            </div>
            <section>
              <h4 className="text-sm font-semibold">Suroviny</h4>
              <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                {selectedRecipeIngredients.map((ingredient, index) => (
                  <li key={ingredient.name + index} className="flex items-start justify-between gap-4 px-3 py-2.5 text-sm">
                    <span>{ingredient.name}</span>
                    <span className="shrink-0 text-right text-fg-muted">{ingredient.sourceMeasure ?? `${ingredient.quantity} ${ingredient.unit}`}</span>
                  </li>
                ))}
              </ul>
            </section>
            {selectedRecipe.sourceUrl && (
              <a
                href={selectedRecipe.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl text-sm font-semibold text-accent-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Otevřít celý recept <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            )}
          </div>
        )}
      </Sheet>
    </section>
  )
}
