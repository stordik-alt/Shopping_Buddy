import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { MobileApiError, getRecipe, searchRecipes, type MobileRecipe } from '../lib/shopping-list-api'
import { getAccessToken } from '../lib/auth'
import { RefreshButton } from './refresh-button'
import { useMobileTheme } from '../lib/theme'

const PAGE_SIZE = 6

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

export function RecipesScreen({ onAuthExpired }: { onAuthExpired: () => void }) {
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
      const result = await searchRecipes(query.trim(), requestedPage)
      setResults(result.results)
      setPage(result.page)
      setTotal(result.total)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Recepty se nepodařilo načíst.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setLoading(false)
    }
  }, [loading, onAuthExpired, query])

  async function openRecipe(recipeId: string) {
    setDetailLoading(true)
    setError(null)
    try {
      setSelected(await getRecipe(recipeId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Detail receptu se nepodařilo načíst.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setDetailLoading(false)
    }
  }

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
          {selected.description ? <Text style={styles.description}>{selected.description}</Text> : null}
          <Text style={styles.sectionTitle}>Suroviny</Text>
          {selected.ingredients.length === 0 ? (
            <Text style={styles.supporting}>Suroviny nejsou v katalogu dostupné.</Text>
          ) : selected.ingredients.map((ingredient) => (
            <Text key={ingredient.id} style={styles.ingredient}>
              •  {ingredient.originalText}
            </Text>
          ))}
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
          ) : results.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.sectionTitle}>{query.trim() ? 'Žádné recepty nenalezeny' : 'Co dnes uvařit?'}</Text>
              <Text style={styles.supporting}>{query.trim() ? 'Zkuste jiný název nebo surovinu.' : 'Zadejte název jídla nebo surovinu a recepty se zobrazí zde.'}</Text>
            </View>
          ) : (
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
          )}
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
  primaryButton: { minHeight: 48, backgroundColor: colors.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 8 },
  primaryButtonText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' },
}), [colors])
}
