import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { MobileApiError, getBudgetSummary, type MobileBudgetSummary } from '../lib/shopping-list-api'

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toLocaleString('cs-CZ')} ${currency}`
  }
}

function dateLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })
}

export function BudgetScreen({ onAuthExpired }: { onAuthExpired: () => void }) {
  const [summary, setSummary] = useState<MobileBudgetSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSummary(await getBudgetSummary())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Rozpočet se nepodařilo načíst.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setLoading(false)
    }
  }, [onAuthExpired])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" style={styles.scroll}>
      <View style={styles.heading}>
        <View>
          <Text style={styles.title}>Rozpočet domácnosti</Text>
          {summary ? <Text style={styles.supporting}>{dateLabel(summary.period.start)} – {dateLabel(summary.period.end)}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" disabled={loading} onPress={() => void load()} style={styles.refreshButton}>
          <Text style={styles.refreshText}>{loading ? 'Načítám…' : 'Obnovit'}</Text>
        </Pressable>
      </View>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading && !summary ? (
        <View style={styles.empty}>
          <ActivityIndicator color="#087e8b" size="large" />
          <Text style={styles.supporting}>Načítání rozpočtu…</Text>
        </View>
      ) : summary ? (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>Rozpočet za období</Text>
            <Text style={styles.budget}>{money(summary.budget, summary.currency)}</Text>
            <View style={styles.row}>
              <Text style={styles.supporting}>Skutečné výdaje</Text>
              <Text style={styles.value}>{money(summary.spent, summary.currency)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.supporting}>{summary.remaining >= 0 ? 'Zbývá' : 'Překročeno o'}</Text>
              <Text style={[styles.remaining, summary.remaining < 0 && styles.over]}>
                {money(Math.abs(summary.remaining), summary.currency)}
              </Text>
            </View>
            {summary.budget > 0 ? (
              <View accessibilityLabel={`Vyčerpáno ${Math.min(100, Math.max(0, (summary.spent / summary.budget) * 100)).toFixed(0)} procent rozpočtu`} style={styles.progressTrack}>
                <View style={[styles.progress, summary.remaining < 0 && styles.progressOver, { width: `${Math.min(100, Math.max(0, (summary.spent / summary.budget) * 100))}%` }]} />
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Výdaje podle kategorií</Text>
            {summary.categories.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.sectionTitle}>Zatím bez výdajů</Text>
                <Text style={styles.supporting}>Výdaje za toto období se zobrazí podle kategorií.</Text>
              </View>
            ) : summary.categories.map((category) => (
              <View key={category.category} style={styles.category}>
                <View style={styles.row}>
                  <Text style={styles.categoryName}>{category.category}</Text>
                  <Text style={styles.value}>{money(category.total, summary.currency)}</Text>
                </View>
                {category.limit != null ? (
                  <>
                    <View accessibilityLabel={`Limit kategorie ${category.category}`} style={styles.progressTrack}>
                      <View style={[
                        styles.progress,
                        category.level === 'over' && styles.progressOver,
                        category.level === 'warning' && styles.progressWarning,
                        { width: `${category.limit > 0 ? Math.min(100, Math.max(0, (category.total / category.limit) * 100)) : 0}%` },
                      ]} />
                    </View>
                    <Text style={[styles.supporting, category.level === 'over' && styles.over]}>
                      {category.total <= category.limit
                        ? `Limit ${money(category.limit, summary.currency)} · zbývá ${money(category.limit - category.total, summary.currency)}`
                        : `Limit překročen o ${money(category.total - category.limit, summary.currency)}`}
                    </Text>
                  </>
                ) : null}
              </View>
            ))}
          </View>
        </>
      ) : !error ? (
        <View style={styles.emptyCard}>
          <Text style={styles.supporting}>Rozpočet není dostupný. Zkuste stránku obnovit.</Text>
        </View>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  heading: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: '#122c3a', fontSize: 20, fontWeight: '700' },
  supporting: { color: '#526674', fontSize: 13, lineHeight: 19, marginTop: 4 },
  refreshButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  refreshText: { color: '#23515d', fontSize: 14, fontWeight: '600' },
  card: { backgroundColor: '#ffffff', borderColor: '#dce6e9', borderRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
  label: { color: '#526674', fontSize: 14, fontWeight: '600' },
  budget: { color: '#122c3a', fontSize: 28, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  value: { color: '#122c3a', fontSize: 15, fontWeight: '700' },
  remaining: { color: '#087e8b', fontSize: 18, fontWeight: '800' },
  over: { color: '#a72d2d' },
  progressTrack: { height: 8, overflow: 'hidden', borderRadius: 8, backgroundColor: '#e6eef0', marginTop: 5 },
  progress: { height: '100%', borderRadius: 8, backgroundColor: '#087e8b' },
  progressWarning: { backgroundColor: '#d99016' },
  progressOver: { backgroundColor: '#b63838' },
  section: { gap: 10 },
  sectionTitle: { color: '#122c3a', fontSize: 17, fontWeight: '700', marginBottom: 2 },
  category: { backgroundColor: '#ffffff', borderColor: '#dce6e9', borderRadius: 16, borderWidth: 1, padding: 14, gap: 4 },
  categoryName: { color: '#122c3a', flex: 1, fontSize: 15, fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  emptyCard: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#dce6e9', borderRadius: 16, borderWidth: 1, padding: 22, gap: 4 },
  error: { color: '#a72d2d', backgroundColor: '#fff0f0', borderRadius: 12, padding: 12, fontSize: 14, lineHeight: 20 },
})
