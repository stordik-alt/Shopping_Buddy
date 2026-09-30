'use client'

import { useState } from 'react'
import { ArrowUpRight, Clock3, Search, Star } from 'lucide-react'
import { getRecipeAction, searchRecipesAction } from '@/app/actions/recipes'
import { formatIngredientQuantity, scaleRecipeIngredients } from '@/lib/recipes/scaling'
import type { Recipe, RecipeSearchResult } from '@/lib/recipes/types'

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

function RecipeCard({ recipe, onOpen }: { recipe: RecipeSearchResult; onOpen: () => void }) {
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
        </div>
      </div>
    </button>
  )
}

export function Recipes() {
  const [query, setQuery] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [sort, setSort] = useState<'relevance' | 'rating' | 'time'>('relevance')
  const [results, setResults] = useState<RecipeSearchResult[]>([])
  const [selected, setSelected] = useState<Recipe | null>(null)
  const [servings, setServings] = useState<number | undefined>()
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(term = query) {
    const normalized = term.trim()
    if (!normalized) return
    setLoading(true)
    setError(null)
    try {
      const next = await searchRecipesAction(normalized, { sourceId: sourceId || undefined, sort })
      setResults(next)
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
      setSelected(recipe)
      setServings(recipe.servings)
    } catch {
      setError('Detail receptu se nepodařilo načíst. Otevřete prosím původní recept.')
    } finally {
      setDetailLoading(false)
    }
  }

  function applyQuickFilter(filter: string) {
    setQuery(filter)
    void search(filter)
  }

  const scaled = selected && servings !== undefined ? scaleRecipeIngredients(selected, servings) : selected?.ingredients ?? []

  if (selected) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <button type="button" onClick={() => setSelected(null)} className="text-sm font-medium text-primary hover:underline">
          ← Zpět na recepty
        </button>
        <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {selected.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.imageUrl} alt="" className="max-h-72 w-full object-cover" referrerPolicy="no-referrer" />
          )}
          <div className="space-y-5 p-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{selected.sourceName}</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">{selected.title}</h2>
              {selected.description && <p className="mt-2 text-sm text-muted-foreground">{selected.description}</p>}
            </div>

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
                {scaled.map((ingredient) => (
                  <li key={ingredient.id} className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm">
                    <span>{ingredient.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {ingredient.quantity !== undefined ? formatIngredientQuantity(ingredient.quantity) : ''}
                      {ingredient.unit ? ` ${ingredient.unit}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
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
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Recepty</h2>
        <p className="mt-1 text-sm text-muted-foreground">Vyhledejte recept, upravte počet porcí a pokračujte na původní web.</p>
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

      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map((filter) => (
          <button key={filter} type="button" onClick={() => applyQuickFilter(filter)} className="min-h-9 rounded-full bg-muted px-3 text-sm font-medium hover:bg-primary/10">{filter}</button>
        ))}
      </div>

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

      {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">{error}</div>}
      {detailLoading && <div role="status" className="rounded-xl bg-muted p-4 text-sm">Načítám detail receptu…</div>}
      {!loading && query.trim() && results.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Pro tento dotaz se recepty nenašly.</div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {results.map((recipe) => <RecipeCard key={recipe.canonicalUrl} recipe={recipe} onOpen={() => void openRecipe(recipe)} />)}
      </div>
    </div>
  )
}
