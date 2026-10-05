'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, Clock3, CookingPot, Search, SlidersHorizontal, Star } from 'lucide-react'
import { getRecipeAction, getRecipeCollectionsAction, getRecipePricingAction, getRecipeRecommendationsAction, searchRecipesAction, toggleRecipeFavoriteAction } from '@/app/actions/recipes'
import { analyzeRecipeIngredients, type RecipeShoppingItem } from '@/lib/recipes/shopping'
import { formatIngredientQuantity, scaleRecipeIngredients } from '@/lib/recipes/scaling'
import type { RecipePriceEstimate } from '@/lib/recipes/pricing'
import { money, shortDate } from '@/lib/format'
import type { Recipe, RecipeSearchResult, SavedRecipe } from '@/lib/recipes/types'
import type { RecipePantryRecommendation } from '@/lib/recipes/recommendations'
import type { Household, PantryItem } from '@/lib/types'
import type { SavedMealPlan } from '@/lib/db/queries'
import type { Ingredient, MealType, WeeklyMealPlan } from '@/lib/meal-plans'
import { MealPlan } from '@/components/dashboard/meal-plan'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Select } from '@/components/ui/field'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'

const SOURCES = [
  { id: '', name: 'Všechny zdroje' },
  { id: 'recepty-cz', name: 'Recepty.cz' },
  { id: 'apetit', name: 'Apetit Online' },
  { id: 'toprecepty', name: 'Toprecepty' },
  { id: 'vareni', name: 'Vaření.cz' },
]

const QUICK_FILTERS = ['Rychlé', 'Večeře', 'Oběd', 'Polévky', 'Maso', 'Těstoviny', 'Dezerty', 'Bezmasé'] as const

function rating(recipe: RecipeSearchResult) {
  if (recipe.ratingValue === undefined) return null
  const scale = recipe.ratingScale || 5
  return ((recipe.ratingValue / scale) * 5).toFixed(1).replace('.', ',')
}

function RecipeCard({
  recipe,
  onOpen,
  recommendation,
}: {
  recipe: RecipeSearchResult
  onOpen: () => void
  recommendation?: RecipePantryRecommendation
}) {
  const score = rating(recipe)
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-2xl border border-border bg-card p-3 text-left shadow-[var(--shadow-card)] transition hover:border-accent-solid/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4">
      <span className="flex gap-4">
        {/* The picture is a supplement: without one the card keeps the same shape with a quiet icon. */}
        <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted sm:size-24">
          {recipe.imageUrl ? (
            // Source images are untrusted remote content; keep them as a normal image rather than widening Next image host configuration.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={recipe.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <CookingPot className="size-7 text-fg-muted" aria-hidden="true" />
          )}
        </span>
        <span className="block min-w-0 flex-1">
          <span className="block font-semibold leading-snug">{recipe.title}</span>
          <span className="mt-1 block text-xs text-fg-muted">{recipe.sourceName}</span>
          <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-secondary">
            {recipe.servings !== undefined && <span>{recipe.servings} porce</span>}
            {recipe.totalTimeMinutes !== undefined && (
              <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" aria-hidden="true" />{recipe.totalTimeMinutes} min</span>
            )}
            {score !== null && (
              <span className="inline-flex items-center gap-1 text-foreground"><Star className="size-3.5 fill-current" aria-hidden="true" />{score}{recipe.ratingCount !== undefined ? ` · ${recipe.ratingCount} hodnocení` : ''}</span>
            )}
          </span>
          {recommendation && (
            <span className="mt-2 block text-xs font-medium text-accent-text">
              Máte doma {recommendation.coveredIngredientCount} z {recommendation.ingredientCount} surovin
              {recommendation.missingIngredientCount > 0 ? ` · chybí ${recommendation.missingIngredientCount}` : ''}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

type RecipesProps = {
  household: Household
  initialPlan: SavedMealPlan | null
  pantryItems: PantryItem[]
  onAddIngredients: (ingredients: RecipeShoppingItem[]) => Promise<number>
  onAddMealPlanIngredients: (ingredients: Ingredient[]) => void
  onMarkCooked: (day: string, mealType: MealType) => void
  onPlanSaved: (budgetLimit: number, plan: WeeklyMealPlan) => void
  onGoToShopping: () => void
  /** A meal of the plan to open (from "Dnes vaříme" on Domů); consumed once via onFocusHandled. */
  focusMeal?: { day: string; mealType: MealType } | null
  onFocusHandled?: () => void
}

export function Recipes({ household, initialPlan, pantryItems, onAddIngredients, onAddMealPlanIngredients, onMarkCooked, onPlanSaved, onGoToShopping, focusMeal = null, onFocusHandled }: RecipesProps) {
  const [section, setSection] = useState<'recipes' | 'meal-plan'>(focusMeal ? 'meal-plan' : 'recipes')
  // The focus is read once, at mount (the tab mounts this view); clear it so it does not reopen later.
  const [initialMeal] = useState(focusMeal)
  useEffect(() => {
    if (focusMeal) onFocusHandled?.()
  }, [focusMeal, onFocusHandled])
  const [query, setQuery] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [sort, setSort] = useState<'relevance' | 'rating' | 'time'>('relevance')
  const [results, setResults] = useState<RecipeSearchResult[]>([])
  const [resultsPage, setResultsPage] = useState(1)
  const [totalResultCount, setTotalResultCount] = useState(0)
  const RECIPES_PER_PAGE = 6
  const [selected, setSelected] = useState<Recipe | null>(null)
  const [servings, setServings] = useState<number | undefined>()
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<Set<string>>(new Set())
  const [addingIngredients, setAddingIngredients] = useState(false)
  const [addedCount, setAddedCount] = useState(0)
  const [favorites, setFavorites] = useState<RecipeSearchResult[]>([])
  const [history, setHistory] = useState<SavedRecipe[]>([])
  const [collectionView, setCollectionView] = useState<'favorites' | 'history' | null>(null)
  const [collectionsLoading, setCollectionsLoading] = useState(true)
  const [favoriteSaving, setFavoriteSaving] = useState(false)
  const [householdFilter, setHouseholdFilter] = useState(false)
  const [recommendations, setRecommendations] = useState<RecipePantryRecommendation[]>([])
  const [recommendationsLoading, setRecommendationsLoading] = useState(false)
  const [pricing, setPricing] = useState<RecipePriceEstimate | null>(null)
  const [pricingLoading, setPricingLoading] = useState(false)

  useEffect(() => {
    if (!selected) {
      setPricing(null)
      setPricingLoading(false)
      return
    }

    let active = true
    setPricingLoading(true)
    void getRecipePricingAction(selected.sourceId, selected.canonicalUrl, servings)
      .then((data) => {
        if (active) setPricing(data)
      })
      .catch(() => {
        if (active) setPricing(null)
      })
      .finally(() => {
        if (active) setPricingLoading(false)
      })

    return () => {
      active = false
    }
  }, [selected, servings])

  useEffect(() => {
    let active = true
    void getRecipeCollectionsAction()
      .then((data) => {
        if (!active) return
        setFavorites(data.favorites)
        setHistory(data.history)
      })
      .catch(() => {
        // Collections are a convenience layer; search/detail can still work when loading them fails.
      })
      .finally(() => {
        if (active) setCollectionsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function search(term = query, page = 1) {
    const normalized = term.trim()
    if (!normalized) return
    setLoading(true)
    setError(null)
    try {
      const next = await searchRecipesAction(normalized, {
        sourceId: sourceId || undefined,
        sort,
        householdFilter,
        page,
        pageSize: RECIPES_PER_PAGE,
      })
      setResults(next.results)
      setTotalResultCount(next.total)
      setResultsPage(next.page)
    } catch {
      setError('Recepty se nepodařilo načíst. Zkuste to znovu.')
    } finally {
      setLoading(false)
    }
  }

  async function openRecipe(result: RecipeSearchResult) {
    setDetailLoading(true)
    setError(null)
    try {
      const recipe = await getRecipeAction(result.sourceId, result.canonicalUrl)
      const initialServings = recipe.servings
      const initialIngredients = initialServings !== undefined ? scaleRecipeIngredients(recipe, initialServings) : recipe.ingredients
      const analysis = analyzeRecipeIngredients(initialIngredients, pantryItems)
      setSelected(recipe)
      setServings(initialServings)
      setSelectedIngredientIds(new Set(analysis.filter((entry) => !entry.problem && (entry.missingQuantity ?? 0) > 0).map((entry) => entry.ingredient.id)))
      setAddedCount(0)
      setPricing(null)
      setCollectionView(null)
    } catch {
      setError('Detail receptu se nepodařilo načíst. Otevřete prosím původní recept.')
    } finally {
      setDetailLoading(false)
    }
  }

  async function loadRecommendations() {
    if (recommendationsLoading) return
    setRecommendationsLoading(true)
    setError(null)
    try {
      const data = await getRecipeRecommendationsAction()
      setRecommendations(data.recipes)
    } catch {
      setError('Doporučení podle zásob se nepodařilo načíst. Zkuste to znovu.')
    } finally {
      setRecommendationsLoading(false)
    }
  }

  function applyQuickFilter(filter: string) {
    setQuery(filter)
    void search(filter)
  }

  const scaled = selected && servings !== undefined ? scaleRecipeIngredients(selected, servings) : selected?.ingredients ?? []
  const shoppingAnalysis = useMemo(() => (selected ? analyzeRecipeIngredients(scaled, pantryItems) : []), [selected, scaled, pantryItems])
  const selectedShoppingItems = shoppingAnalysis
    .filter((entry) => selectedIngredientIds.has(entry.ingredient.id) && entry.missingQuantity !== null && entry.missingQuantity > 0 && entry.unit)
    .map((entry) => ({
      name: entry.ingredient.name,
      quantity: entry.missingQuantity as number,
      unit: entry.unit as RecipeShoppingItem['unit'],
      sourceMeasure: entry.sourceMeasure,
    }))

  const sectionTabs = (
    <SegmentedControl
      label="Recepty"
      value={section}
      onChange={(value) => {
        setSection(value)
        if (value === 'recipes') setSelected(null)
      }}
      options={[
        { value: 'recipes', label: 'Recepty' },
        { value: 'meal-plan', label: 'Jídelníček' },
      ]}
    />
  )


  async function toggleFavorite() {
    if (!selected || favoriteSaving) return
    setFavoriteSaving(true)
    setError(null)
    try {
      const isFavorite = await toggleRecipeFavoriteAction(selected)
      setFavorites((current) =>
        isFavorite
          ? [selected, ...current.filter((recipe) => recipe.canonicalUrl !== selected.canonicalUrl)]
          : current.filter((recipe) => recipe.canonicalUrl !== selected.canonicalUrl),
      )
    } catch {
      setError('Oblíbený recept se nepodařilo uložit. Zkuste to znovu.')
    } finally {
      setFavoriteSaving(false)
    }
  }

  async function addSelectedIngredients() {
    if (selectedShoppingItems.length === 0 || addingIngredients) return
    setAddingIngredients(true)
    setError(null)
    try {
      const count = await onAddIngredients(selectedShoppingItems)
      setAddedCount(count)
      setSelectedIngredientIds(new Set())
    } catch {
      setError('Suroviny se nepodařilo přidat do nákupu. Zkuste to znovu.')
    } finally {
      setAddingIngredients(false)
    }
  }

  if (section === 'meal-plan') {
    return (
      <div className="space-y-5">
        {sectionTabs}
        <MealPlan
          household={household}
          initialPlan={initialPlan}
          pantryItems={pantryItems}
          onAddIngredients={onAddMealPlanIngredients}
          onMarkCooked={onMarkCooked}
          onPlanSaved={onPlanSaved}
          initialMeal={initialMeal}
        />
      </div>
    )
  }

  if (selected) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        {sectionTabs}
        <Button variant="ghost" size="lg" className="-ml-2 text-accent-text" onClick={() => setSelected(null)}>
          <ArrowLeft aria-hidden="true" /> Zpět na recepty
        </Button>
        <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="space-y-5 p-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-fg-muted">{selected.sourceName}</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">{selected.title}</h2>
                {selected.description && <p className="mt-2 text-sm text-fg-secondary">{selected.description}</p>}
              </div>
              <button
                type="button"
                aria-pressed={favorites.some((recipe) => recipe.canonicalUrl === selected.canonicalUrl)}
                aria-label={favorites.some((recipe) => recipe.canonicalUrl === selected.canonicalUrl) ? 'Odebrat z oblíbených' : 'Uložit do oblíbených'}
                title={favorites.some((recipe) => recipe.canonicalUrl === selected.canonicalUrl) ? 'Odebrat z oblíbených' : 'Uložit do oblíbených'}
                disabled={favoriteSaving}
                onClick={() => void toggleFavorite()}
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent-subtle aria-pressed:text-accent-text disabled:opacity-50"
              >
                <Star className={favorites.some((recipe) => recipe.canonicalUrl === selected.canonicalUrl) ? 'size-5 fill-current' : 'size-5'} aria-hidden="true" />
              </button>
            </div>

            {selected.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <div className="-mx-5 overflow-hidden bg-muted/30">
                <img
                  src={selected.imageUrl}
                  alt={selected.title}
                  className="block h-auto max-h-[70vh] w-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/60 p-3">
              <span className="text-sm font-medium">Počet porcí</span>
              <button type="button" aria-label="Méně porcí" disabled={servings === undefined || servings <= 1} onClick={() => setServings((value) => value === undefined ? value : Math.max(1, value - 1))} className="size-11 rounded-full bg-card text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">−</button>
              <span className="min-w-8 text-center text-lg font-semibold" aria-live="polite">{servings ?? '—'}</span>
              <button type="button" aria-label="Více porcí" disabled={servings === undefined} onClick={() => setServings((value) => value === undefined ? value : value + 1)} className="size-11 rounded-full bg-card text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">+</button>
              {selected.servings === undefined && <span className="text-sm text-fg-muted">Počet porcí není u tohoto receptu dostupný.</span>}
            </div>

            <section>
              <h3 className="text-lg font-semibold">Suroviny</h3>
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                {shoppingAnalysis.map((entry) => {
                  const selectedForShopping = selectedIngredientIds.has(entry.ingredient.id)
                  const missing = entry.missingQuantity ?? 0
                  return (
                    <li key={entry.ingredient.id} className="text-sm">
                      {/* The whole row is the checkbox's label, so the tap target is the row, not a 16 px box. */}
                      <label className="flex cursor-pointer items-start gap-3 px-4 py-3 has-[:disabled]:cursor-default">
                        <input
                          type="checkbox"
                          checked={selectedForShopping}
                          disabled={entry.problem !== null || missing <= 0}
                          onChange={() => {
                            setSelectedIngredientIds((current) => {
                              const next = new Set(current)
                              if (next.has(entry.ingredient.id)) next.delete(entry.ingredient.id)
                              else next.add(entry.ingredient.id)
                              return next
                            })
                          }}
                          className="mt-0.5 size-5 shrink-0 accent-[var(--accent-solid)]"
                          aria-label={`Přidat ${entry.ingredient.name} do nákupu`}
                        />
                        <span className="block min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-4">
                            <span>{entry.ingredient.name}</span>
                            <span className="shrink-0 text-fg-muted">
                              {entry.sourceMeasure ?? (
                                <>
                                  {entry.quantity !== null ? formatIngredientQuantity(entry.quantity) : ''}
                                  {entry.unit ? ` ${entry.unit}` : entry.ingredient.unit ? ` ${entry.ingredient.unit}` : ''}
                                </>
                              )}
                            </span>
                          </span>
                          {entry.problem && (
                            <span className="mt-1 block text-xs text-destructive">{entry.problem} {entry.ingredient.originalText}</span>
                          )}
                          {!entry.problem && entry.stockQuantity > 0 && (
                            <span className="mt-1 block text-xs text-fg-muted">
                              {missing > 0
                                ? `Máte doma ${formatIngredientQuantity(entry.stockQuantity)} ${entry.unit}; do nákupu ${formatIngredientQuantity(missing)} ${entry.unit}.`
                                : `Máte doma dostatečné množství: ${formatIngredientQuantity(entry.stockQuantity)} ${entry.unit}.`}
                            </span>
                          )}
                          {!entry.problem && entry.stockQuantity === 0 && (
                            <span className="mt-1 block text-xs text-fg-muted">Nemáte evidovanou zásobu.</span>
                          )}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="accent" size="lg" className="h-auto whitespace-normal py-2" onClick={() => void addSelectedIngredients()} disabled={addingIngredients || selectedShoppingItems.length === 0}>
                  {addingIngredients ? 'Přidávám…' : 'Přidat vybrané suroviny do nákupu'}
                </Button>
                {addedCount > 0 && (
                  <>
                    <span role="status" className="text-sm text-fg-secondary">Přidáno {addedCount} položek do nákupu.</span>
                    <Button variant="ghost" size="lg" className="text-accent-text" onClick={onGoToShopping}>
                      Přejít do nákupu
                    </Button>
                  </>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Odhad ceny</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Podle aktuálně evidovaných cen a akcí. Cena není garantovaná.</p>
                </div>
                {pricingLoading ? (
                  <span role="status" className="text-sm text-muted-foreground">Počítám…</span>
                ) : pricing?.estimatedTotal != null ? (
                  <span className="text-xl font-semibold">{money(pricing.estimatedTotal)}</span>
                ) : (
                  <span className="text-sm font-medium text-muted-foreground">Cena není dostupná</span>
                )}
              </div>

              {pricing && (
                <>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Oceněno {pricing.pricedIngredientCount} z {pricing.ingredientCount} surovin.
                    {!pricing.complete && pricing.estimatedTotal != null ? ' Jde o neúplný odhad.' : ''}
                  </p>

                  {pricing.ingredientPrices.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-xs font-semibold">Nejlevnější známé ceny surovin</p>
                      {pricing.ingredientPrices.map((item) => (
                        <div key={item.ingredientId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{item.ingredientName}</span>
                          <span className="text-right">
                            <span className="font-medium text-foreground">{money(item.cost)}</span> · {item.store}
                            {item.isDeal && <span className="ml-1 font-medium text-accent-text">akce</span>}
                            {(item.estimatedQuantity || item.packageSize) && (
                              <span className="block text-xs text-fg-muted">
                                {item.estimatedQuantity && 'odhad spotřeby'}
                                {item.estimatedQuantity && item.packageSize ? ' · ' : ''}
                                {item.packageSize ? `balení ${item.packageSize}` : ''}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {pricing.cheapestCompleteStore && (
                    <p className="mt-3 text-sm">
                      Kompletní nákup v <span className="font-semibold">{pricing.cheapestCompleteStore.store}</span> vychází přibližně na <span className="font-semibold">{money(pricing.cheapestCompleteStore.total)}</span>.
                    </p>
                  )}

                  {pricing.unpricedIngredients.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Bez bezpečně použitelné ceny: {pricing.unpricedIngredients.join(', ')}.
                    </p>
                  )}

                  {pricing.activeDeals.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-semibold">Aktuální akce</p>
                      {pricing.activeDeals.slice(0, 4).map((deal) => (
                        <p key={deal.ingredientName + deal.store} className="text-xs text-muted-foreground">
                          {deal.ingredientName}: <span className="font-medium text-foreground">{money(deal.price)}</span> v {deal.store} do {shortDate(deal.validUntil)}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>

            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              {selected.totalTimeMinutes !== undefined && <span>{selected.totalTimeMinutes} min celkem</span>}
              {selected.ratingValue !== undefined && <span>Hodnocení {rating(selected)}{selected.ratingCount !== undefined ? ` · ${selected.ratingCount} hodnocení` : ''}</span>}
            </div>

            <a href={selected.sourceUrl} target="_blank" rel="noreferrer noopener" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              Zobrazit celý recept <ArrowUpRight aria-hidden="true" />
            </a>
            <p className="text-xs text-muted-foreground">Zdroj: {selected.sourceName}</p>
          </div>
        </article>
      </div>
    )
  }

  const collection = collectionView === 'favorites' ? favorites : history
  const totalPages = Math.max(1, Math.ceil(totalResultCount / RECIPES_PER_PAGE))

  // First screen: the two sections, one search field, the pantry suggestion and a row of quick
  // searches. Source, sort and "Podle domácnosti" refine a search, so they wait behind "Další filtry".
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* The tab title is already in the header: the section switch and "my recipes" share one row. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {sectionTabs}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Moje recepty">
          {(
            [
              ['favorites', 'Oblíbené', favorites.length],
              ['history', 'Historie', history.length],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              aria-pressed={collectionView === value}
              onClick={() => setCollectionView((current) => (current === value ? null : value))}
              className={`min-h-10 rounded-full px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${collectionView === value ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent-subtle'}`}
            >
              {label}
              {collectionsLoading ? '' : ` · ${count}`}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
        className="flex gap-2"
        role="search"
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
          <Input aria-label="Hledat recept" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Např. kuřecí maso rýže" className="pl-10" />
        </div>
        <Button type="submit" size="lg" disabled={loading || !query.trim()}>
          {loading ? 'Hledám…' : 'Hledat'}
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2" aria-label="Rychlé hledání">
        {QUICK_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => applyQuickFilter(filter)}
            className="min-h-10 rounded-full bg-muted px-4 text-sm font-medium hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent-subtle p-4">
        <p className="min-w-0 text-sm">
          <span className="font-semibold">Co uvařit z toho, co mám doma?</span>
          <span className="block text-fg-secondary">Návrhy podle aktuálních zásob, alergií a toho, co domácnost nechce.</span>
        </p>
        <Button variant="accent" size="lg" onClick={() => void loadRecommendations()} disabled={recommendationsLoading}>
          <CookingPot aria-hidden="true" /> {recommendationsLoading ? 'Hledám podle zásob…' : 'Navrhnout recepty'}
        </Button>
      </div>

      <details className="group">
        <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg text-sm font-medium text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="size-4" aria-hidden="true" /> Další filtry
          <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-2 grid gap-3 rounded-2xl bg-muted/60 p-3 sm:grid-cols-3">
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Zdroj</span>
            <Select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
              {SOURCES.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Řazení</span>
            <Select
              value={sort}
              onChange={(event) => {
                const next = event.target.value as typeof sort
                setSort(next)
                if (query.trim()) void search(query)
              }}
            >
              <option value="relevance">Relevance</option>
              <option value="rating">Hodnocení</option>
              <option value="time">Doba přípravy</option>
            </Select>
          </label>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm font-medium">
            <input
              type="checkbox"
              checked={householdFilter}
              onChange={(event) => {
                setHouseholdFilter(event.target.checked)
                if (query.trim()) void search(query)
              }}
              className="size-5 accent-[var(--accent-solid)]"
            />
            Podle domácnosti
          </label>
        </div>
      </details>

      {collectionView && (
        <section className="space-y-3" aria-label={collectionView === 'favorites' ? 'Oblíbené recepty' : 'Naposledy otevřené'}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">{collectionView === 'favorites' ? 'Oblíbené recepty' : 'Naposledy otevřené'}</h3>
            <Button variant="ghost" className="text-accent-text" onClick={() => setCollectionView(null)}>
              Skrýt
            </Button>
          </div>
          {collection.length === 0 ? (
            <EmptyState
              icon={collectionView === 'favorites' ? <Star /> : <Clock3 />}
              title={collectionView === 'favorites' ? 'Zatím nemáte žádné oblíbené recepty' : 'Historie je zatím prázdná'}
              description={collectionView === 'favorites' ? 'V detailu receptu ho uložíte hvězdičkou.' : 'Otevřené recepty se tu objeví samy.'}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {collection.map((recipe) => (
                <RecipeCard key={recipe.canonicalUrl} recipe={recipe} onOpen={() => void openRecipe(recipe)} />
              ))}
            </div>
          )}
        </section>
      )}

      {recommendations.length > 0 && (
        <section className="space-y-3" aria-label="Co uvařit z toho, co mám doma">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Z toho, co máte doma</h3>
            <Button variant="ghost" className="text-accent-text" onClick={() => setRecommendations([])}>
              Skrýt
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {recommendations.map((recipe) => (
              <RecipeCard key={recipe.canonicalUrl} recipe={recipe} recommendation={recipe} onOpen={() => void openRecipe(recipe)} />
            ))}
          </div>
        </section>
      )}

      {error && (
        <div role="alert" className="rounded-xl bg-destructive-subtle p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {detailLoading && (
        <div role="status" className="rounded-xl bg-muted p-4 text-sm">
          Načítám detail receptu…
        </div>
      )}
      {loading && results.length === 0 && (
        <div role="status" aria-label="Hledám recepty" className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      )}
      {!loading && query.trim() && results.length === 0 && !error && (
        <EmptyState icon={<Search />} title="Pro tento dotaz se recepty nenašly" description="Zkuste jiné slovo nebo jednu z rychlých nabídek výše." />
      )}
      {results.length > 0 && (
        <section aria-label="Výsledky vyhledávání" className="space-y-3">
          <p className="text-sm text-fg-muted">
            {totalResultCount} nalezených receptů · stránka {resultsPage} z {totalPages}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {results.map((recipe) => (
              <RecipeCard key={recipe.canonicalUrl} recipe={recipe} onOpen={() => void openRecipe(recipe)} />
            ))}
          </div>
          {totalResultCount > RECIPES_PER_PAGE && (
            <nav aria-label="Stránkování receptů" className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="lg" onClick={() => void search(query, resultsPage - 1)} disabled={loading || resultsPage <= 1}>
                <ArrowLeft aria-hidden="true" />
                Předchozí
              </Button>
              <span className="min-w-16 text-center text-sm font-medium">
                {resultsPage} / {totalPages}
              </span>
              <Button variant="outline" size="lg" onClick={() => void search(query, resultsPage + 1)} disabled={loading || resultsPage >= totalPages}>
                Další
                <ArrowRight aria-hidden="true" />
              </Button>
            </nav>
          )}
        </section>
      )}
    </div>
  )
}
