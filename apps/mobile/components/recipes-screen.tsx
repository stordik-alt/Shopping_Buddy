import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { MobileApiError, getPantry, getRecipe, getRecipeCollections, getRecipePricing, getRecipeRecommendations, searchRecipes, toggleRecipeFavorite, type MobileRecipe, type MobileRecipeCollection } from '../lib/shopping-list-api'
import { getAccessToken } from '../lib/auth'
import { RefreshButton } from './refresh-button'
import { useMobileTheme } from '../lib/theme'
import { scaleRecipeIngredients } from '../../../lib/recipes/scaling'
import { analyzeRecipeIngredients, toRecipeShoppingItem } from '../../../lib/recipes/shopping'
import type { PantryItem } from '../../../lib/types'
import type { ItemUnit } from '@anitka/shared/units'

type RecipeMode = 'search' | 'favorites' | 'history' | 'recommendations'

const PAGE_SIZE = 12
const RECIPE_SOURCE_OPTIONS = [
  { id: 'recepty-cz', name: 'Recepty.cz' },
  { id: 'apetit', name: 'Apetit Online' },
  { id: 'toprecepty', name: 'Toprecepty' },
  { id: 'vareni', name: 'Vaření.cz' },
] as const

function RecipePhoto({ uri, token, title }: { uri?: string; token: string | null; title: string }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [failed, setFailed] = useState(false)
  if (!uri || !token || failed) {
    return (
      <View accessibilityLabel={`Obrázek receptu ${title} není dostupný`} style={styles.photoFallback}>
        <Text style={styles.photoFallbackIcon}>🍲</Text>
      </View>
    )
  }

  return (
    <Image
      accessibilityLabel={`Obrázek receptu ${title}`}
      onError={() => setFailed(true)}
      source={{ uri, headers: { Authorization: ['Bearer', token].join(' ') } }}
      style={styles.photo}
    />
  )
}

function ratingLabel(recipe: Pick<MobileRecipe, 'ratingValue' | 'ratingScale' | 'ratingCount'>): string {
  if (recipe.ratingValue == null) return 'Bez hodnocení'
  const rating = (recipe.ratingValue / (recipe.ratingScale || 5)) * 5
  return `${rating.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} / 5 ★${recipe.ratingCount ? ` · ${recipe.ratingCount} hodnocení` : ''}`
}

export function RecipesScreen({ onAuthExpired, onAddToShopping }: { onAuthExpired: () => void; onAddToShopping: (items: { name: string; quantity: number; unit: ItemUnit }[]) => void }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchRecipes>>['results']>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<MobileRecipe | null>(null)
  const [imageToken, setImageToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<RecipeMode>('search')
  const [sort, setSort] = useState<'relevance' | 'rating' | 'time'>('relevance')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [householdFilter, setHouseholdFilter] = useState(false)
  const [collections, setCollections] = useState<MobileRecipeCollection | null>(null)
  const [recommendations, setRecommendations] = useState<Awaited<ReturnType<typeof getRecipeRecommendations>> | null>(null)
  const [selectedServings, setSelectedServings] = useState(1)
  const [favoriteSaving, setFavoriteSaving] = useState(false)
  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set())
  const [pantryItems, setPantryItems] = useState<Awaited<ReturnType<typeof getPantry>>['items']>([])
  const [priceEstimate, setPriceEstimate] = useState<Awaited<ReturnType<typeof getRecipePricing>> | null>(null)
  const [pricingLoading, setPricingLoading] = useState(false)

  useEffect(() => {
    let active = true
    void getAccessToken().then((token) => {
      if (active) setImageToken(token)
    }).catch(() => {
      if (active) setImageToken(null)
    })
    return () => {
      active = false
    }
  }, [])

  const search = useCallback(async (requestedPage = 1) => {
    if (!query.trim() || loading) return
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      const result = await searchRecipes(query.trim(), { page: requestedPage, pageSize: PAGE_SIZE, sort, sourceId: sourceId ?? undefined, householdFilter })
      setResults(result.results)
      setPage(result.page)
      setTotal(result.total)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Recepty se nepodařilo načíst.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setLoading(false)
    }
  }, [householdFilter, loading, onAuthExpired, query, sort, sourceId])

  async function openRecipe(recipeId: string) {
    setDetailLoading(true)
    setError(null)
    try {
      const recipe = await getRecipe(recipeId)
      setSelected(recipe)
      setSelectedServings(recipe.servings && recipe.servings > 0 ? recipe.servings : 1)
      setPriceEstimate(null)
      try {
        const stock = await getPantry()
        setPantryItems(stock.items)
        const analysis = analyzeRecipeIngredients(recipe.ingredients, stock.items as unknown as PantryItem[])
        setSelectedIngredients(new Set(analysis.filter((entry) => entry.problem === null && (entry.missingQuantity ?? 0) > 0).map((entry) => entry.ingredient.id)))
      } catch (caught) {
        setPantryItems([])
        setSelectedIngredients(new Set(recipe.ingredients.map((ingredient) => ingredient.id)))
        if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Detail receptu se nepodařilo načíst.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setDetailLoading(false)
    }
  }

  async function openMode(nextMode: RecipeMode) {
    setMode(nextMode)
    setSelected(null)
    setError(null)
    if (nextMode === 'search') return
    setLoading(true)
    try {
      if (nextMode === 'favorites' || nextMode === 'history') setCollections(await getRecipeCollections())
      else setRecommendations(await getRecipeRecommendations())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Recepty se nepodařilo načíst.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally { setLoading(false) }
  }

  async function changeFavorite() {
    if (!selected || favoriteSaving) return
    setFavoriteSaving(true)
    setError(null)
    try {
      const result = await toggleRecipeFavorite(selected.id)
      setSelected({ ...selected, isFavorite: result.favorite })
      setCollections(await getRecipeCollections())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Oblíbený recept se nepodařilo uložit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally { setFavoriteSaving(false) }
  }

  async function loadPricing() {
    if (!selected || pricingLoading) return
    setPricingLoading(true)
    setError(null)
    try { setPriceEstimate(await getRecipePricing(selected.id, selectedServings)) }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Cenu receptu se nepodařilo vypočítat.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally { setPricingLoading(false) }
  }

  function addSelectedIngredients() {
    if (!selected) return
    const ingredients = scaleRecipeIngredients(selected, selectedServings)
    const analysis = analyzeRecipeIngredients(ingredients, pantryItems as unknown as PantryItem[])
    const selectedRows = analysis.filter((entry) => selectedIngredients.has(entry.ingredient.id))
    const items = selectedRows.flatMap((entry) => {
      if (entry.problem) {
        const placeholder = toRecipeShoppingItem(entry.ingredient)
        return placeholder ? [{ name: placeholder.name, quantity: placeholder.quantity, unit: placeholder.unit }] : []
      }
      if (entry.sourceMeasure) return [{ name: entry.ingredient.name, quantity: 1, unit: 'ks' as const }]
      const quantity = (entry.missingQuantity ?? 0) > 0 ? entry.missingQuantity! : (entry.quantity ?? 0)
      if (quantity <= 0 || !entry.unit) return []
      return [{ name: entry.ingredient.name, quantity, unit: entry.unit }]
    })
    if (items.length) onAddToShopping(items)
    setError(null)
  }

  const scaledIngredients = selected ? scaleRecipeIngredients(selected, selectedServings) : []
  const ingredientAnalysis = selected ? analyzeRecipeIngredients(scaledIngredients, pantryItems as unknown as PantryItem[]) : []

  async function openSource(url: string) {
    try {
      await Linking.openURL(url)
    } catch {
      setError('Původní recept se nepodařilo otevřít.')
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" style={styles.scroll}>
      {selected ? (
        <>
          <Pressable accessibilityRole="button" onPress={() => setSelected(null)} style={styles.backButton}>
            <Text style={styles.backText}>‹  Zpět k receptům</Text>
          </Pressable>
          <RecipePhoto title={selected.title} token={imageToken} uri={selected.imageUrl} />
          <Text style={styles.title}>{selected.title}</Text>
          <Text style={styles.source}>{selected.sourceName}</Text>
          <Text style={styles.supporting}>{ratingLabel(selected)}</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: Boolean(selected.isFavorite) }} disabled={favoriteSaving} onPress={() => void changeFavorite()} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{favoriteSaving ? 'Ukládám…' : selected.isFavorite ? '★ Odebrat z oblíbených' : '☆ Přidat do oblíbených'}</Text></Pressable>
          {selected.description ? <Text style={styles.description}>{selected.description}</Text> : null}
          <View style={styles.servingsRow}><Text style={styles.sectionTitle}>Porce: {selectedServings}</Text><Pressable accessibilityLabel="Méně porcí" disabled={selectedServings <= 1} onPress={() => { setSelectedServings((value) => Math.max(1, value - 1)); setPriceEstimate(null) }} style={styles.servingsButton}><Text style={styles.servingsButtonText}>−</Text></Pressable><Pressable accessibilityLabel="Více porcí" disabled={selectedServings >= 1000} onPress={() => { setSelectedServings((value) => Math.min(1000, value + 1)); setPriceEstimate(null) }} style={styles.servingsButton}><Text style={styles.servingsButtonText}>+</Text></Pressable></View>
          <Text style={styles.sectionTitle}>Suroviny</Text>
          {scaledIngredients.length === 0 ? (
            <Text style={styles.supporting}>Suroviny nejsou v katalogu dostupné.</Text>
          ) : scaledIngredients.map((ingredient, index) => {
            const analysis = ingredientAnalysis[index]
            const checked = selectedIngredients.has(ingredient.id)
            return <Pressable key={ingredient.id} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setSelectedIngredients((current) => { const next = new Set(current); if (next.has(ingredient.id)) next.delete(ingredient.id); else next.add(ingredient.id); return next })} style={styles.ingredientRow}>
              <Text style={[styles.ingredientCheck, checked && styles.ingredientCheckSelected]}>{checked ? '✓' : '○'}</Text>
              <View style={styles.ingredientText}><Text style={styles.ingredient}>{ingredient.name} · {ingredient.originalText}</Text><Text style={styles.supporting}>{analysis?.problem ?? (analysis?.missingQuantity === 0 ? 'Máte v zásobách' : analysis?.missingQuantity != null ? `Chybí ${analysis.missingQuantity} ${analysis.unit ?? ''}` : 'Množství nelze bezpečně určit')}</Text></View>
            </Pressable>
          })}
          <Pressable accessibilityRole="button" disabled={selectedIngredients.size === 0} onPress={addSelectedIngredients} style={[styles.primaryButton, selectedIngredients.size === 0 && styles.disabledButton]}><Text style={styles.primaryButtonText}>Přidat vybrané suroviny na seznam ({selectedIngredients.size})</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={pricingLoading} onPress={() => void loadPricing()} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{pricingLoading ? 'Počítám cenu…' : 'Ocenit suroviny a obchody'}</Text></Pressable>
          {priceEstimate ? <View style={styles.priceCard}><Text style={styles.sectionTitle}>{priceEstimate.estimatedTotal == null ? 'Cena není dostupná' : `Odhad surovin: ${priceEstimate.estimatedTotal.toLocaleString('cs-CZ')} Kč`}</Text><Text style={styles.supporting}>{priceEstimate.cheapestCompleteStore ? `Nejlevnější obchod: ${priceEstimate.cheapestCompleteStore.store} · ${priceEstimate.cheapestCompleteStore.total.toLocaleString('cs-CZ')} Kč` : 'Cenu nelze bezpečně určit pro všechny suroviny.'}</Text>{priceEstimate.ingredientPrices.map((row) => <Text key={`${row.ingredientId}-${row.store}`} style={styles.supporting}>{row.ingredientName}: {row.cost.toLocaleString('cs-CZ')} Kč · {row.store}{row.estimatedQuantity ? ' · přibližné množství' : ''}</Text>)}{priceEstimate.unpricedIngredients.map((name) => <Text key={name} style={styles.supporting}>Bez ceny: {name}</Text>)}</View> : null}
          <Pressable accessibilityRole="link" onPress={() => void openSource(selected.sourceUrl)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Zobrazit celý recept u zdroje ↗</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.heading}>
            <View style={styles.headingText}>
              <Text numberOfLines={1} style={styles.title}>Recepty</Text>
              <Text style={styles.supporting}>Hledejte podle názvu nebo surovin.</Text>
            </View>
            <RefreshButton disabled={results.length === 0} loading={loading} onPress={() => void search(page)} />
          </View>
          <ScrollView horizontal contentContainerStyle={styles.modeRow} showsHorizontalScrollIndicator={false}>{([['search', 'Hledat'], ['favorites', 'Oblíbené'], ['history', 'Nedávné'], ['recommendations', 'Podle zásob']] as [RecipeMode, string][]).map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: mode === value }} onPress={() => void openMode(value)} style={[styles.modeChip, mode === value && styles.modeChipActive]}><Text style={[styles.modeText, mode === value && styles.modeTextActive]}>{label}</Text></Pressable>)}</ScrollView>
          {mode === 'search' ? <>
          <View style={styles.searchRow}>
            <TextInput
              accessibilityLabel="Hledat recept podle názvu nebo surovin"
              maxLength={120}
              onChangeText={setQuery}
              onSubmitEditing={() => void search(1)}
              placeholder="Např. kuřecí maso, rýže"
              placeholderTextColor={colors.mutedText}
              returnKeyType="search"
              style={styles.input}
              value={query}
            />
            <Pressable accessibilityRole="button" disabled={loading || !query.trim()} onPress={() => void search(1)} style={[styles.searchButton, (!query.trim() || loading) && styles.disabledButton]}>
              <Text style={styles.searchButtonText}>Hledat</Text>
            </Pressable>
          </View>
          <ScrollView horizontal contentContainerStyle={styles.modeRow} showsHorizontalScrollIndicator={false}>
            {[[null, 'Všechny zdroje'] as const, ...RECIPE_SOURCE_OPTIONS.map((source) => [source.id, source.name] as const)].map(([id, label]) => <Pressable key={id ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: sourceId === id }} onPress={() => setSourceId(id)} style={[styles.modeChip, sourceId === id && styles.modeChipActive]}><Text style={[styles.modeText, sourceId === id && styles.modeTextActive]}>{label}</Text></Pressable>)}
          </ScrollView>
          <View style={styles.filtersRow}>{([['relevance', 'Doporučené'], ['rating', 'Hodnocení'], ['time', 'Čas']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: sort === value }} onPress={() => setSort(value)} style={[styles.filterChip, sort === value && styles.modeChipActive]}><Text style={[styles.modeText, sort === value && styles.modeTextActive]}>{label}</Text></Pressable>)}<Pressable accessibilityRole="checkbox" accessibilityState={{ checked: householdFilter }} onPress={() => setHouseholdFilter((value) => !value)} style={styles.filterChip}><Text style={styles.modeText}>{householdFilter ? '☑' : '☐'} Strava domácnosti</Text></Pressable></View>
          </> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {detailLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.supporting}>Načítání receptu…</Text>
            </View>
          ) : loading && results.length === 0 ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.supporting}>Hledám recepty…</Text>
            </View>
          ) : mode === 'search' && results.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.sectionTitle}>{query.trim() ? 'Žádné recepty nenalezeny' : 'Co dnes uvařit?'}</Text>
              <Text style={styles.supporting}>{query.trim() ? 'Zkuste jiný název nebo surovinu.' : 'Zadejte název jídla nebo surovinu a recepty se zobrazí zde.'}</Text>
            </View>
          ) : mode === 'search' ? (
            <>
              <Text style={styles.resultCount}>{total} {total === 1 ? 'recept' : total < 5 ? 'recepty' : 'receptů'}</Text>
              {results.map((recipe) => (
                <Pressable
                  accessibilityRole="button"
                  disabled={detailLoading}
                  key={recipe.id}
                  onPress={() => void openRecipe(recipe.id)}
                  style={styles.recipeCard}
                >
                  <RecipePhoto title={recipe.title} token={imageToken} uri={recipe.imageUrl} />
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>{recipe.title}</Text>
                    <Text style={styles.source}>{recipe.sourceName}</Text>
                    <Text style={styles.supporting}>{ratingLabel(recipe)}</Text>
                    <Text style={styles.supporting}>
                      {[recipe.servings !== undefined ? `${recipe.servings} porce` : null, recipe.totalTimeMinutes !== undefined ? `${recipe.totalTimeMinutes} min` : null]
                        .filter(Boolean)
                        .join(' · ') || 'Otevřít detail receptu'}
                    </Text>
                  </View>
                </Pressable>
              ))}
              <View style={styles.pagination}>
                <Pressable accessibilityRole="button" disabled={loading || page <= 1} onPress={() => void search(page - 1)} style={[styles.pageButton, page <= 1 && styles.disabledButton]}>
                  <Text style={styles.pageText}>Předchozí</Text>
                </Pressable>
                <Text style={styles.supporting}>Strana {page} z {Math.max(1, Math.ceil(total / PAGE_SIZE))}</Text>
                <Pressable accessibilityRole="button" disabled={loading || page * PAGE_SIZE >= total} onPress={() => void search(page + 1)} style={[styles.pageButton, page * PAGE_SIZE >= total && styles.disabledButton]}>
                  <Text style={styles.pageText}>Další</Text>
                </Pressable>
              </View>
            </>
          ) : loading ? <View style={styles.empty}><ActivityIndicator color={colors.primary} size="large" /></View> : mode === 'recommendations' ? (
            recommendations?.recipes.length ? recommendations.recipes.map((recipe) => <Pressable key={recipe.id} accessibilityRole="button" onPress={() => void openRecipe(recipe.id)} style={styles.recipeCard}><RecipePhoto title={recipe.title} token={imageToken} uri={recipe.imageUrl} /><View style={styles.cardText}><Text style={styles.cardTitle}>{recipe.title}</Text><Text style={styles.source}>{recipe.sourceName}</Text><Text style={styles.supporting}>Máte {recipe.coveredIngredientCount} z {recipe.ingredientCount} surovin doma · chybí {recipe.missingIngredientCount}</Text></View></Pressable>) : <View style={styles.emptyCard}><Text style={styles.sectionTitle}>Zásoby zatím recept nedoporučují</Text><Text style={styles.supporting}>Přidejte nebo roztřiďte potraviny v zásobách a zkuste to znovu.</Text></View>
          ) : (mode === 'favorites' ? collections?.favorites : collections?.history)?.length ? (mode === 'favorites' ? collections!.favorites : collections!.history).map((recipe) => <Pressable key={recipe.id} accessibilityRole="button" onPress={() => void openRecipe(recipe.id)} style={styles.recipeCard}><RecipePhoto title={recipe.title} token={imageToken} uri={recipe.imageUrl} /><View style={styles.cardText}><Text style={styles.cardTitle}>{recipe.title}</Text><Text style={styles.source}>{recipe.sourceName}</Text></View></Pressable>) : <View style={styles.emptyCard}><Text style={styles.sectionTitle}>{mode === 'favorites' ? 'Zatím žádné oblíbené recepty' : 'Historie je prázdná'}</Text><Text style={styles.supporting}>{mode === 'favorites' ? 'V detailu receptu ho uložíte hvězdičkou.' : 'Otevřené recepty se tu zobrazí.'}</Text></View>}
        </>
      )}
    </ScrollView>
  )
}

function useStyles() {
  const { colors } = useMobileTheme()
  return useMemo(() => StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 24, gap: 12 },
  heading: { minHeight: 64, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  headingText: { flex: 1, minWidth: 0 },
  title: { color: colors.foreground, fontSize: 22, fontWeight: '700' },
  supporting: { color: colors.secondaryText, fontSize: 14, lineHeight: 20, marginTop: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, minHeight: 48, borderColor: colors.inputBorder, borderRadius: 12, borderWidth: 1, backgroundColor: colors.card, color: colors.foreground, paddingHorizontal: 14, fontSize: 16 },
  searchButton: { minHeight: 48, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  searchButtonText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '700' },
  secondaryButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-start', borderColor: colors.inputBorder, borderRadius: 12, borderWidth: 1, backgroundColor: colors.card, paddingHorizontal: 12 },
  secondaryButtonText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  disabledButton: { opacity: 0.5 },
  error: { color: colors.destructive, backgroundColor: colors.destructiveSubtle, borderRadius: 12, padding: 12, fontSize: 14, lineHeight: 20 },
  empty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyCard: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 24, gap: 8 },
  sectionTitle: { color: colors.foreground, fontSize: 18, fontWeight: '700', marginTop: 8 },
  resultCount: { color: colors.secondaryText, fontSize: 14, fontWeight: '600' },
  recipeCard: { minHeight: 112, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 12, gap: 12 },
  photo: { width: 88, height: 88, borderRadius: 12, backgroundColor: colors.muted },
  photoFallback: { width: 88, height: 88, borderRadius: 12, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  photoFallbackIcon: { fontSize: 30 },
  cardText: { flex: 1, minWidth: 0, gap: 3 },
  cardTitle: { color: colors.foreground, fontSize: 16, fontWeight: '700' },
  source: { color: colors.secondaryText, fontSize: 13 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  pageButton: { minHeight: 44, justifyContent: 'center', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10 },
  pageText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  backButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  backText: { color: colors.accentText, fontSize: 15, fontWeight: '600' },
  description: { color: colors.secondaryText, fontSize: 15, lineHeight: 22 },
  ingredient: { color: colors.foreground, fontSize: 15, lineHeight: 22 },
  modeRow: { gap: 7, paddingVertical: 2, paddingRight: 10 },
  modeChip: { minHeight: 38, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12 },
  modeChipActive: { backgroundColor: colors.accentSubtle, borderColor: colors.primary },
  modeText: { color: colors.secondaryText, fontSize: 13, fontWeight: '600' },
  modeTextActive: { color: colors.accentText, fontWeight: '700' },
  filtersRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  filterChip: { minHeight: 36, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 10 },
  servingsRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  servingsButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.accentSubtle },
  servingsButtonText: { color: colors.accentText, fontSize: 22, fontWeight: '700' },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 },
  ingredientCheck: { color: colors.mutedText, fontSize: 20, width: 24 },
  ingredientCheckSelected: { color: colors.accentText, fontWeight: '800' },
  ingredientText: { flex: 1, minWidth: 0 },
  priceCard: { gap: 4, borderRadius: 14, backgroundColor: colors.muted, padding: 12 },
  primaryButton: { minHeight: 48, backgroundColor: colors.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 8 },
  primaryButtonText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' },
}), [colors])
}
