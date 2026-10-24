import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronDown, ChevronUp, Plus, RotateCcw } from 'lucide-react-native'
import type { UsualItem } from '../../../lib/usual-items'
import { createOfflineItemId } from '../lib/offline-shopping-list'
import { useMobileTheme } from '../lib/theme'
import { addShoppingItem, getUsualItems, MobileApiError, type MobileShoppingItem } from '../lib/shopping-list-api'

function intervalLabel(days: number) {
  const rounded = Math.max(1, Math.round(days))
  if (rounded === 1) return 'kupujete zhruba každý den'
  if (rounded < 5) return `kupujete zhruba každé ${rounded} dny`
  return `kupujete zhruba každých ${rounded} dní`
}

function lastBoughtLabel(days: number) {
  if (days === 0) return 'naposledy dnes'
  if (days === 1) return 'naposledy včera'
  return `naposledy před ${days} dny`
}

function countLabel(count: number) {
  if (count === 1) return '1 položka je na řadě'
  if (count >= 2 && count <= 4) return `${count} položky jsou na řadě`
  return `${count} položek je na řadě`
}

export function UsualItemsScreen({ openItemNames, disabled, onAdded, onAuthExpired }: {
  openItemNames: string[]
  disabled: boolean
  onAdded: (item: MobileShoppingItem) => void | Promise<void>
  onAuthExpired: () => void
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [suggestions, setSuggestions] = useState<UsualItem[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const listKey = openItemNames.join('\u0000')

  useEffect(() => {
    if (disabled) { setLoading(false); return }
    let active = true
    setLoading(true)
    getUsualItems()
      .then(({ suggestions: rows }) => { if (active) setSuggestions(rows) })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Obvyklé nákupy se nepodařilo načíst.')
        if (active && caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [disabled, listKey, onAuthExpired])

  async function add(rows: UsualItem[], key: string) {
    setBusy(key)
    setError(null)
    try {
      for (const suggestion of rows) {
        const { item } = await addShoppingItem(
          suggestion.name,
          createOfflineItemId().slice('offline-'.length),
          suggestion.quantity,
          suggestion.unit,
          { detail: `${suggestion.quantity} ${suggestion.unit} · obvyklý nákup` },
        )
        await onAdded(item)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Položky se nepodařilo přidat. Zkuste to znovu.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setBusy(null)
    }
  }

  if (!loading && suggestions.length === 0 && !error) return null
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} disabled={disabled || loading} onPress={() => setOpen((value) => !value)} style={styles.header}>
      <View style={styles.heading}><RotateCcw color={colors.accentText} size={18} /><View style={styles.headingText}><Text style={styles.title}>Doplnit obvyklé</Text><Text style={styles.note}>{loading ? 'Načítám doporučení…' : countLabel(suggestions.length)}</Text></View></View>
      {loading ? <ActivityIndicator color={colors.primary} size="small" /> : open ? <ChevronUp color={colors.mutedText} size={18} /> : <ChevronDown color={colors.mutedText} size={18} />}
    </Pressable>
    {open ? <View style={styles.contents}>
      {suggestions.map((item) => <View key={item.name} style={styles.row}>
        <View style={styles.itemText}><Text style={styles.itemName}>{item.name}</Text><Text style={styles.note}>{item.quantity} {item.unit} · {intervalLabel(item.intervalDays)}, {lastBoughtLabel(item.daysSinceLast)}</Text></View>
        <Pressable accessibilityLabel={`Přidat ${item.name} na seznam`} accessibilityRole="button" disabled={disabled || busy !== null} onPress={() => void add([item], item.name)} style={[styles.addButton, (disabled || busy !== null) && styles.disabled]}><Plus color={colors.accentText} size={16} /><Text style={styles.addText}>{busy === item.name ? 'Přidávám…' : 'Přidat'}</Text></Pressable>
      </View>)}
      {suggestions.length > 1 ? <Pressable accessibilityRole="button" disabled={disabled || busy !== null} onPress={() => void add(suggestions, '*')} style={[styles.allButton, (disabled || busy !== null) && styles.disabled]}><Plus color={colors.primaryForeground} size={17} /><Text style={styles.allText}>{busy === '*' ? 'Přidávám…' : 'Přidat vše na seznam'}</Text></Pressable> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View> : error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>
}

function useStyles() {
  const { colors } = useMobileTheme()
  return StyleSheet.create({
    card: { marginHorizontal: 16, marginBottom: 10, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.card },
    header: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    heading: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    headingText: { flex: 1, gap: 2 },
    title: { color: colors.foreground, fontSize: 14, fontWeight: '700' },
    note: { color: colors.mutedText, fontSize: 12, lineHeight: 17 },
    contents: { gap: 8 },
    row: { minHeight: 56, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: colors.border },
    itemText: { flex: 1, gap: 2 },
    itemName: { color: colors.foreground, fontSize: 14, fontWeight: '600' },
    addButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    addText: { color: colors.accentText, fontSize: 13, fontWeight: '600' },
    allButton: { minHeight: 46, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, borderRadius: 13, backgroundColor: colors.primary },
    allText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '700' },
    disabled: { opacity: 0.5 },
    error: { color: colors.destructive, fontSize: 13 },
  })
}
