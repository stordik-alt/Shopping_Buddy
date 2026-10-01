'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Clock3, Search, Star } from 'lucide-react'
import { getRecipeAction, getRecipeCollectionsAction, getRecipePricingAction, getRecipeRecommendationsAction, searchRecipesAction, toggleRecipeFavoriteAction } from '@/app/actions/recipes'
import { analyzeRecipeIngredients, type RecipeShoppingItem } from '@/lib/recipes/shopping'
import { formatIngredientQuantity, scaleRecipeIngredients } from '@/lib/recipes/scaling'
import type { RecipePriceEstimate } from '@/lib/recipes/pricing'
import { money, shortDate } from '@/lib/format'
import type { Recipe, RecipeSearchResult, SavedRecipe } from '@/lib/recipes/types'
import type { RecipePantryRecommendation } from '@/lib/recipes/recommendations'
import type { PantryItem } from '@/lib/types'

const SOURCES = [
  { id: '', name: 'Všechny zdroje' },
  { id: 'recepty-cz', name: 'Recepty.cz' },
  { id: 'apetit', name: 'Apetit Online' },
  { id: 'toprecepty', name: 'Toprecepty' },
  { id: 'vareni', name: 'Vaření.cz' },
]

const QUICK_FILTERS = ['Rychlé', 'Večeře', 'Oběd', 'Polévky', 'Maso', 'Těstoviny', 'Dezerty', 'Bezmasé'] as const
const RECIPES_PER_PAGE = 6

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
    <button type="button" onClick={onOpen} className="w-full rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
          {recipe.imageUrl ? (
            // Source images are untrusted remote content; keep them as a normal image rather than widening Next image host configuration.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={recipe.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <span className="text-xs text-muted-foreground">Bez obrázku</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{recipe.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{recipe.sourceName}</p>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {recipe.servings !== undefined && <span>{recipe.servings} porce</span>}
            {recipe.totalTimeMinutes !== undefined && (
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{recipe.totalTimeMinutes} min</span>
            )}
            {score !== null && (
              <span className="inline-flex items-center gap-1 text-foreground"><Star className="h-3.5 w-3.5 fill-current" />{score}{recipe.ratingCount !== undefined ? ` · ${recipe.ratingCount} hodnocení` : ''}</span>
            )}
          </div>
          {recommendation && (
            <p className="mt-2 text-xs font-medium text-primary">
              Máte doma {recommendation.coveredIngredientCount} z {recommendation.ingredientCount} surovin
              {recommendation.missingIngredientCount > 0 ? ` · chybí ${recommendation.missingIngredientCount}` : ''}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}

type RecipesProps = {
  pantryItems: PantryItem[]
  onAddIngredients: (ingredients: RecipeShoppingItem[]) => Promise<number>
  onGoToShopping: () => void
}

export function Recipes({ pantryItems, onAddIngredients, onGoToShopping }: RecipesProps) {
  const [query, setQuery] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [sort, setSort] = useState<'relevance' | 'rating' | 'time'>('relevance')
  const [results, setResults] = useState<RecipeSearchResult[]>([])
  const [resultsPage, setResultsPage] = useState(1)
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

  async function search(term = query) {
    const normalized = term.trim()
    if (!normalized) return
    setLoading(true)
    setError(null)
    try {
      const next = await searchRecipesAction(normalized, {
        sourceId: sourceId || undefined,
        sort,
        householdFilter,
      })
      setResults(next)
      setResultsPage(1)
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

  const totalResultPages = Math.max(1, Math.ceil(results.length / RECIPES_PER_PAGE))
  const pagedResults = results.slice((resultsPage - 1) * RECIPES_PER_PAGE, resultsPage * RECIPES_PER_PAGE)

  const scaled = selected && servings !== undefined ? scaleRecipeIngredients(selected, servings) : selected?.ingredients ?? []
  const shoppingAnalysis = useMemo(() => (selected ? analyzeRecipeIngredients(scaled, pantryItems) : []), [selected, scaled, pantryItems])
  const selectedShoppingItems = shoppingAnalysis
    .filter((entry) => selectedIngredientIds.has(entry.ingredient.id) && entry.missingQuantity !== null && entry.missingQuantity > 0 && entry.unit)
    .map((entry) => ({ name: entry.ingredient.name, quantity: entry.missingQuantity as number, unit: entry.unit as RecipeShoppingItem['unit'] }))

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

  if (selected) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <button type="button" onClick={() => setSelected(null)} className="text-sm font-medium text-primary hover:underline">
          ← Zpět na recepty
        </button>
        <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="space-y-5 p-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">{selected.sourceName}</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">{selected.title}</h2>
                {selected.description && <p className="mt-2 text-sm text-muted-foreground">{selected.description}</p>}
              </div>
              <button
                type="button"
                aria-pressed={favorites.some((recipe) => recipe.canonicalUrl === selected.canonicalUrl)}
                aria-label={favorites.some((recipe) => recipe.canonicalUrl === selected.canonicalUrl) ? 'Odebrat z oblíbených' : 'Uložit do oblíbených'}
                title={favorites.some((recipe) => recipe.canonicalUrl === selected.canonicalUrl) ? 'Odebrat z oblíbených' : 'Uložit do oblíbených'}
                disabled={favoriteSaving}
                onClick={() => void toggleFavorite()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition hover:bg-primary/10 disabled:opacity-50"
              >
                <Star className={favorites.some((recipe) => recipe.canonicalUrl === selected.canonicalUrl) ? 'h-5 w-5 fill-current' : 'h-5 w-5'} aria-hidden="true" />
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
              <button type="button" aria-label="Méně porcí" disabled={servings === undefined || servings <= 1} onClick={() => setServings((value) => value === undefined ? value : Math.max(1, value - 1))} className="h-9 w-9 rounded-full bg-card font-semibold disabled:opacity-40">−</button>
              <span className="min-w-8 text-center font-semibold">{servings ?? '—'}</span>
              <button type="button" aria-label="Více porcí" disabled={servings === undefined} onClick={() => setServings((value) => value === undefined ? value : value + 1)} className="h-9 w-9 rounded-full bg-card font-semibold disabled:opacity-40">+</button>
              {selected.servings === undefined && <span className="text-xs text-muted-foreground">Počet porcí není u tohoto receptu dostupný.</span>}
            </div>

            <section>
              <h3 className="text-lg font-semibold">Suroviny</h3>
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                {shoppingAnalysis.map((entry) => {
                  const selectedForShopping = selectedIngredientIds.has(entry.ingredient.id)
                  const missing = entry.missingQuantity ?? 0
                  return (
                    <li key={entry.ingredient.id} className="px-4 py-3 text-sm">
                      <div className="flex items-start gap-3">
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
                          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                          aria-label={`Přidat ${entry.ingredient.name} do nákupu`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-4">
                            <span>{entry.ingredient.name}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {entry.quantity !== null ? formatIngredientQuantity(entry.quantity) : ''}
                              {entry.unit ? ` ${entry.unit}` : entry.ingredient.unit ? ` ${entry.ingredient.unit}` : ''}
                            </span>
                          </div>
                          {entry.problem && (
                            <p className="mt-1 text-xs text-destructive">{entry.problem} {entry.ingredient.originalText}</p>
                          )}
                          {!entry.problem && entry.stockQuantity > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {missing > 0
                                ? `Máte doma ${formatIngredientQuantity(entry.stockQuantity)} ${entry.unit}; do nákupu ${formatIngredientQuantity(missing)} ${entry.unit}.`
                                : `Máte doma dostatečné množství: ${formatIngredientQuantity(entry.stockQuantity)} ${entry.unit}.`}
                            </p>
                          )}
                          {!entry.problem && entry.stockQuantity === 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">Nemáte evidovanou zásobu.</p>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void addSelectedIngredients()}
                  disabled={addingIngredients || selectedShoppingItems.length === 0}
                  className="min-h-10 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {addingIngredients ? 'Přidávám…' : 'Přidat vybrané suroviny do nákupu'}
                </button>
                {addedCount > 0 && (
                  <>
                    <span className="text-sm text-muted-foreground">Přidáno {addedCount} položek do nákupu.</span>
                    <button type="button" onClick={onGoToShopping} className="text-sm font-medium text-primary hover:underline">
                      Přejít do nákupu
                    </button>
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
                          <span>
                            <span className="font-medium text-foreground">{money(item.cost)}</span> · {item.store}
                            {item.isDeal && <span className="ml-1 font-medium text-primary">akce</span>}
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

            <a href={selected.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Zobrazit celý recept <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <p className="text-xs text-muted-foreground">Zdroj: {selected.sourceName}</p>
          </div>
        </article>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Recepty</h2>
          <p className="mt-1 text-sm text-muted-foreground">Vyhledejte recept, upravte počet porcí a pokračujte na původní web.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Moje recepty">
          <button
            type="button"
            aria-pressed={collectionView === 'favorites'}
            onClick={() => setCollectionView((current) => current === 'favorites' ? null : 'favorites')}
            className={`min-h-9 rounded-full px-3 text-sm font-medium transition ${collectionView === 'favorites' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-primary/10'}`}
          >
            Oblíbené{collectionsLoading ? '' : ` · ${favorites.length}`}
          </button>
          <button
            type="button"
            aria-pressed={collectionView === 'history'}
            onClick={() => setCollectionView((current) => current === 'history' ? null : 'history')}
            className={`min-h-9 rounded-full px-3 text-sm font-medium transition ${collectionView === 'history' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-primary/10'}`}
          >
            Historie{collectionsLoading ? '' : ` · ${history.length}`}
          </button>
        </div>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void search() }} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Např. kuřecí maso rýže" className="min-h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <button type="submit" disabled={loading || !query.trim()} className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {loading ? 'Hledám…' : 'Hledat'}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {QUICK_FILTERS.map((filter) => (
          <button key={filter} type="button" onClick={() => applyQuickFilter(filter)} className="min-h-9 rounded-full bg-muted px-3 text-sm font-medium hover:bg-primary/10">{filter}</button>
        ))}
        <label className="inline-flex min-h-9 items-center gap-2 rounded-full bg-muted px-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={householdFilter}
            onChange={(event) => {
              const enabled = event.target.checked
              setHouseholdFilter(enabled)
              if (query.trim()) void search(query)
            }}
            className="size-4 accent-primary"
          />
          Podle domácnosti
        </label>
        <button
          type="button"
          onClick={() => void loadRecommendations()}
          disabled={recommendationsLoading}
          className="min-h-9 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {recommendationsLoading ? 'Hledám podle zásob…' : 'Co uvařit z toho, co mám doma'}
        </button>
      </div>

            {collectionView && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">{collectionView === 'favorites' ? 'Oblíbené recepty' : 'Naposledy otevřené'}</h3>
            <button type="button" onClick={() => setCollectionView(null)} className="text-sm font-medium text-primary hover:underline">Skrýt</button>
          </div>
          {(collectionView === 'favorites' ? favorites : history).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {collectionView === 'favorites' ? 'Zatím nemáte žádné oblíbené recepty.' : 'Historie je zatím prázdná.'}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {(collectionView === 'favorites' ? favorites : history).map((recipe) => (
                <RecipeCard
                  key={recipe.canonicalUrl}
                  recipe={recipe}
                  onOpen={() => void openRecipe(recipe)}
                />
              ))}
            </div>
          )}
        </section>
      )}

<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className="min-h-10 rounded-xl border border-input bg-background px-3 text-sm">
          {SOURCES.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
        </select>
        <select value={sort} onChange={(event) => { const next = event.target.value as typeof sort; setSort(next); if (query.trim()) void search(query) }} className="min-h-10 rounded-xl border border-input bg-background px-3 text-sm">
          <option value="relevance">Řazení: Relevance</option>
          <option value="rating">Řazení: Hodnocení</option>
          <option value="time">Řazení: Doba přípravy</option>
        </select>
      </div>

      {recommendations.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Co uvařit z toho, co mám doma</h3>
              <p className="mt-1 text-sm text-muted-foreground">Návrhy využívají aktuální zásoby a zohledňují uložené alergie a položky, které domácnost nechce.</p>
            </div>
            <button type="button" onClick={() => setRecommendations([])} className="text-sm font-medium text-primary hover:underline">Skrýt</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {recommendations.map((recipe) => (
              <RecipeCard
                key={recipe.canonicalUrl}
                recipe={recipe}
                recommendation={recipe}
                onOpen={() => void openRecipe(recipe)}
              />
            ))}
          </div>
        </section>
      )}

      {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">{error}</div>}
      {detailLoading && <div role="status" className="rounded-xl bg-muted p-4 text-sm">Načítám detail receptu…</div>}
      {!loading && query.trim() && results.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Pro tento dotaz se recepty nenašly.</div>
      )}
      {results.length > 0 && (
        <section aria-label="Výsledky vyhledávání" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>{results.length} nalezených receptů · stránka {resultsPage} z {totalResultPages}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {pagedResults.map((recipe) => <RecipeCard key={recipe.canonicalUrl} recipe={recipe} onOpen={() => void openRecipe(recipe)} />)}
          </div>
          {totalResultPages > 1 && (
            <nav aria-label="Stránkování receptů" className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResultsPage((page) => Math.max(1, page - 1))}
                disabled={resultsPage === 1}
                className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-border bg-card px-3 text-sm font-medium disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Předchozí
              </button>
              <span className="min-w-16 text-center text-sm font-medium">{resultsPage} / {totalResultPages}</span>
              <button
                type="button"
                onClick={() => setResultsPage((page) => Math.min(totalResultPages, page + 1))}
                disabled={resultsPage === totalResultPages}
                className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-border bg-card px-3 text-sm font-medium disabled:opacity-40"
              >
                Další <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </nav>
          )}
        </section>
      )}
    </div>
  )
}
