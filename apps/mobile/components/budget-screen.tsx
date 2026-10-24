import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { EXPENSE_CATEGORY_NAMES, subcategoriesOf, type ExpenseCategory } from '../../../lib/expense-categories'
import {
  addExpense,
  deleteExpense,
  getBudgetSummary,
  getExpenses,
  MobileApiError,
  updateExpense,
  type MobileBudgetSummary,
  type MobileExpense,
} from '../lib/shopping-list-api'
import { RefreshButton } from './refresh-button'
import { colors } from '../lib/theme'

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toLocaleString('cs-CZ')} ${currency}`
  }
}

function dateLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })
}

function todayLocal(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function previousDay(date: string): string {
  const day = new Date(`${date}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate() - 1)
  return day.toISOString().slice(0, 10)
}

type ExpenseDraft = { amount: string; note: string; category: ExpenseCategory; subcategory: string; date: string }

function ExpenseEditor({
  expense,
  currency,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  expense: MobileExpense | null
  currency: string
  busy: boolean
  onClose: () => void
  onSave: (draft: ExpenseDraft) => void
  onDelete: (expense: MobileExpense) => void
}) {
  const [amount, setAmount] = useState(expense ? String(expense.amount).replace('.', ',') : '')
  const [note, setNote] = useState(expense?.note ?? '')
  const [category, setCategory] = useState<ExpenseCategory>((expense?.category as ExpenseCategory) ?? 'Potraviny')
  const [subcategory, setSubcategory] = useState(expense?.subcategory ?? '')
  const [date, setDate] = useState(expense?.date ?? todayLocal())
  const [error, setError] = useState('')

  function save() {
    const parsed = Number(amount.replace(/[\s ]/g, '').replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Zadejte částku větší než 0.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayLocal()) {
      setError('Zadejte platné datum, které není v budoucnosti.')
      return
    }
    setError('')
    onSave({ amount: String(parsed), note: note.trim(), category, subcategory, date })
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.modalBackdrop}>
        <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.editor}>
            <View style={styles.editorHeading}>
              <Text style={styles.editorTitle}>{expense ? 'Upravit výdaj' : 'Nový výdaj'}</Text>
              <Pressable accessibilityLabel="Zavřít formulář" accessibilityRole="button" onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable>
            </View>
            <Text style={styles.label}>Částka ({currency})</Text>
            <TextInput accessibilityLabel="Částka výdaje" keyboardType="decimal-pad" onChangeText={setAmount} placeholder="0,00" selectTextOnFocus style={styles.input} value={amount} />
            <Text style={styles.label}>Kategorie</Text>
            <View style={styles.chipWrap}>
              {EXPENSE_CATEGORY_NAMES.map((value) => (
                <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: category === value }} onPress={() => { setCategory(value); setSubcategory('') }} style={[styles.choiceChip, category === value && styles.choiceChipActive]}>
                  <Text style={[styles.choiceText, category === value && styles.choiceTextActive]}>{value}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Podkategorie (volitelné)</Text>
            <ScrollView horizontal contentContainerStyle={styles.horizontalChips} showsHorizontalScrollIndicator={false}>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: !subcategory }} onPress={() => setSubcategory('')} style={[styles.choiceChip, !subcategory && styles.choiceChipActive]}>
                <Text style={[styles.choiceText, !subcategory && styles.choiceTextActive]}>Bez podkategorie</Text>
              </Pressable>
              {subcategoriesOf(category).map((value) => (
                <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: subcategory === value }} onPress={() => setSubcategory(value)} style={[styles.choiceChip, subcategory === value && styles.choiceChipActive]}>
                  <Text style={[styles.choiceText, subcategory === value && styles.choiceTextActive]}>{value}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.label}>Datum platby</Text>
            <TextInput accessibilityLabel="Datum platby" onChangeText={setDate} placeholder="RRRR-MM-DD" style={styles.input} value={date} />
            <Text style={styles.label}>Položka / poznámka</Text>
            <TextInput accessibilityLabel="Poznámka k výdaji" onChangeText={setNote} placeholder="Např. nákup, elektřina…" style={styles.input} value={note} />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={busy} onPress={save} style={[styles.primaryButton, busy && styles.disabled]}>
              <Text style={styles.primaryButtonText}>{busy ? 'Ukládám…' : expense ? 'Uložit změny' : 'Uložit výdaj'}</Text>
            </Pressable>
            {expense?.editable ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => onDelete(expense)} style={[styles.deleteButton, busy && styles.disabled]}><Text style={styles.deleteText}>Smazat výdaj</Text></Pressable> : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

export function BudgetScreen({ onAuthExpired }: { onAuthExpired: () => void }) {
  const [summary, setSummary] = useState<MobileBudgetSummary | null>(null)
  const [expenses, setExpenses] = useState<MobileExpense[]>([])
  const [period, setPeriod] = useState<{ start: string; end: string; next: string } | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null)
  const selectedPeriodRef = useRef<string | null>(null)
  const [view, setView] = useState<'overview' | 'expenses'>('overview')
  const [editorExpense, setEditorExpense] = useState<MobileExpense | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (requestedPeriod?: string) => {
    setLoading(true)
    setError(null)
    try {
      const nextSummary = await getBudgetSummary()
      setSummary(nextSummary)
      const ledger = await getExpenses(requestedPeriod ?? selectedPeriodRef.current ?? nextSummary.period.start)
      setPeriod(ledger.period)
      selectedPeriodRef.current = ledger.period.start
      setSelectedPeriod(ledger.period.start)
      setExpenses(ledger.expenses)
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

  async function saveExpense(draft: ExpenseDraft) {
    if (!period || saving) return
    setSaving(true)
    setError(null)
    const input = {
      amount: Number(draft.amount),
      note: draft.note || draft.subcategory || draft.category,
      category: draft.category,
      subcategory: draft.subcategory || null,
      date: draft.date,
    }
    try {
      if (editorExpense) await updateExpense(editorExpense.id, input)
      else await addExpense(input)
      setEditorOpen(false)
      setEditorExpense(null)
      await load(draft.date)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Výdaj se nepodařilo uložit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete(expense: MobileExpense) {
    Alert.alert('Smazat výdaj?', `${expense.note || expense.category} · ${money(expense.amount, summary?.currency ?? 'CZK')}`, [
      { text: 'Zrušit', style: 'cancel' },
      { text: 'Smazat', style: 'destructive', onPress: () => { void (async () => {
        setSaving(true)
        try {
          await deleteExpense(expense.id)
          setEditorOpen(false)
          setEditorExpense(null)
          await load(selectedPeriod ?? period?.start)
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : 'Výdaj se nepodařilo smazat.')
          if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
        } finally {
          setSaving(false)
        }
      })() } },
    ])
  }

  const historical = Boolean(period && summary && period.start !== summary.period.start)
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0)

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" style={styles.scroll}>
        <View style={styles.heading}>
          <View style={styles.headingText}>
            <Text numberOfLines={1} style={styles.title}>Rozpočet domácnosti</Text>
            {period ? <Text style={styles.supporting}>{dateLabel(period.start)} – {dateLabel(period.end)}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" disabled={!period || saving} onPress={() => { setEditorExpense(null); setEditorOpen(true) }} style={[styles.addButton, (!period || saving) && styles.disabled]}><Text style={styles.addButtonText}>＋ Výdaj</Text></Pressable>
          <RefreshButton loading={loading} onPress={() => void load()} />
        </View>

        <View style={styles.switcher}>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === 'overview' }} onPress={() => setView('overview')} style={[styles.switchTab, view === 'overview' && styles.switchTabActive]}><Text style={[styles.switchText, view === 'overview' && styles.switchTextActive]}>Přehled</Text></Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === 'expenses' }} onPress={() => setView('expenses')} style={[styles.switchTab, view === 'expenses' && styles.switchTabActive]}><Text style={[styles.switchText, view === 'expenses' && styles.switchTextActive]}>Výdaje</Text></Pressable>
        </View>

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {loading && !summary ? (
          <View style={styles.empty}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.supporting}>Načítání rozpočtu…</Text></View>
        ) : view === 'overview' && summary ? (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>Rozpočet za období</Text>
              <Text style={styles.budget}>{money(summary.budget, summary.currency)}</Text>
              <View style={styles.row}><Text style={styles.supporting}>Skutečné výdaje</Text><Text style={styles.value}>{money(summary.spent, summary.currency)}</Text></View>
              <View style={styles.row}>
                <Text style={styles.supporting}>{summary.remaining >= 0 ? 'Zbývá' : 'Překročeno o'}</Text>
                <Text style={[styles.remaining, summary.remaining < 0 && styles.over]}>{money(Math.abs(summary.remaining), summary.currency)}</Text>
              </View>
              {summary.budget > 0 ? <View accessibilityLabel={`Vyčerpáno ${Math.min(100, Math.max(0, (summary.spent / summary.budget) * 100)).toFixed(0)} procent rozpočtu`} style={styles.progressTrack}><View style={[styles.progress, summary.remaining < 0 && styles.progressOver, { width: `${Math.min(100, Math.max(0, (summary.spent / summary.budget) * 100))}%` }]} /></View> : null}
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Výdaje podle kategorií</Text>
              {summary.categories.length === 0 ? (
                <View style={styles.emptyCard}><Text style={styles.sectionTitle}>Zatím bez výdajů</Text><Text style={styles.supporting}>Výdaje za toto období se zobrazí podle kategorií.</Text></View>
              ) : summary.categories.map((category) => (
                <View key={category.category} style={styles.category}>
                  <View style={styles.row}><Text style={styles.categoryName}>{category.category}</Text><Text style={styles.value}>{money(category.total, summary.currency)}</Text></View>
                  {category.limit != null ? <>
                    <View accessibilityLabel={`Limit kategorie ${category.category}`} style={styles.progressTrack}><View style={[styles.progress, category.level === 'over' && styles.progressOver, category.level === 'warning' && styles.progressWarning, { width: `${category.limit > 0 ? Math.min(100, Math.max(0, (category.total / category.limit) * 100)) : 0}%` }]} /></View>
                    <Text style={[styles.supporting, category.level === 'over' && styles.over]}>{category.total <= category.limit ? `Limit ${money(category.limit, summary.currency)} · zbývá ${money(category.limit - category.total, summary.currency)}` : `Limit překročen o ${money(category.total - category.limit, summary.currency)}`}</Text>
                  </> : null}
                </View>
              ))}
            </View>
          </>
        ) : view === 'expenses' ? (
          <View style={styles.section}>
            <View style={styles.periodControls}>
              <Pressable accessibilityLabel="Starší období" accessibilityRole="button" disabled={loading || !period} onPress={() => period && void load(previousDay(period.start))} style={styles.periodButton}><Text style={styles.periodButtonText}>‹ Starší</Text></Pressable>
              <Text style={styles.periodTitle}>{period ? `${dateLabel(period.start)} – ${dateLabel(period.end)}` : 'Výdaje'}</Text>
              <Pressable accessibilityLabel="Novější období" accessibilityRole="button" disabled={loading || !period || !historical} onPress={() => period && void load(period.next)} style={[styles.periodButton, (!historical || !period) && styles.periodDisabled]}><Text style={styles.periodButtonText}>Novější ›</Text></Pressable>
            </View>
            <View style={styles.totalCard}><Text style={styles.supporting}>Celkem za období</Text><Text style={styles.budget}>{money(total, summary?.currency ?? 'CZK')}</Text></View>
            {expenses.length === 0 ? <View style={styles.emptyCard}><Text style={styles.sectionTitle}>V tomto období zatím nejsou výdaje</Text><Pressable accessibilityRole="button" onPress={() => { setEditorExpense(null); setEditorOpen(true) }}><Text style={styles.link}>Zapsat první výdaj</Text></Pressable></View> : expenses.map((expense) => (
              <Pressable key={expense.id} accessibilityRole="button" accessibilityLabel={`${expense.editable ? 'Upravit' : 'Zobrazit'} výdaj ${expense.note || expense.category}`} onPress={() => { if (expense.editable) { setEditorExpense(expense); setEditorOpen(true) } else Alert.alert('Výdaj z účtenky', `${expense.note || expense.category}\n${expense.category} · ${dateLabel(expense.date)}`) }} style={styles.expenseRow}>
                <View style={styles.expenseText}><Text numberOfLines={1} style={styles.expenseNote}>{expense.note || expense.category}</Text><Text style={styles.supporting}>{expense.category}{expense.subcategory ? ` · ${expense.subcategory}` : ''} · {dateLabel(expense.date)}{expense.editable ? '' : ' · účtenka'}</Text></View>
                <Text style={styles.expenseAmount}>{money(expense.amount, summary?.currency ?? 'CZK')}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
      {editorOpen ? <ExpenseEditor currency={summary?.currency ?? 'CZK'} expense={editorExpense} busy={saving} onClose={() => { if (!saving) { setEditorOpen(false); setEditorExpense(null) } }} onDelete={confirmDelete} onSave={(draft) => void saveExpense(draft)} /> : null}
    </>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  heading: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headingText: { flex: 1, minWidth: 0 },
  title: { color: colors.foreground, fontSize: 20, fontWeight: '700' },
  supporting: { color: colors.secondaryText, fontSize: 13, lineHeight: 19, marginTop: 4 },
  card: { backgroundColor: '#ffffff', borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
  label: { color: colors.secondaryText, fontSize: 14, fontWeight: '600', marginTop: 2 },
  budget: { color: colors.foreground, fontSize: 28, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  value: { color: colors.foreground, fontSize: 15, fontWeight: '700' },
  remaining: { color: colors.accentText, fontSize: 18, fontWeight: '800' },
  over: { color: '#a72d2d' },
  progressTrack: { height: 8, overflow: 'hidden', borderRadius: 8, backgroundColor: '#e6eef0', marginTop: 5 },
  progress: { height: '100%', borderRadius: 8, backgroundColor: colors.accent },
  progressWarning: { backgroundColor: '#d99016' },
  progressOver: { backgroundColor: '#b63838' },
  section: { gap: 10 },
  sectionTitle: { color: colors.foreground, fontSize: 17, fontWeight: '700', marginBottom: 2 },
  category: { backgroundColor: '#ffffff', borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 14, gap: 4 },
  categoryName: { color: colors.foreground, flex: 1, fontSize: 15, fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  emptyCard: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 22, gap: 8 },
  error: { color: '#a72d2d', backgroundColor: '#fff0f0', borderRadius: 12, padding: 12, fontSize: 14, lineHeight: 20 },
  switcher: { padding: 4, flexDirection: 'row', borderRadius: 14, backgroundColor: '#efeee9', gap: 4 },
  switchTab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  switchTabActive: { backgroundColor: '#ffffff' },
  switchText: { color: colors.secondaryText, fontSize: 14, fontWeight: '600' },
  switchTextActive: { color: colors.foreground },
  addButton: { backgroundColor: colors.accentSubtle, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9 },
  addButtonText: { color: colors.accentText, fontWeight: '700', fontSize: 13 },
  periodControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  periodTitle: { flex: 1, textAlign: 'center', fontSize: 13, color: colors.secondaryText, fontWeight: '600' },
  periodButton: { paddingHorizontal: 8, paddingVertical: 9, borderRadius: 10, backgroundColor: '#ffffff' },
  periodButtonText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
  periodDisabled: { opacity: 0.35 },
  totalCard: { backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 3 },
  expenseRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: '#ffffff', borderRadius: 15, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10 },
  expenseText: { flex: 1, minWidth: 0 },
  expenseNote: { color: colors.foreground, fontSize: 14, fontWeight: '700' },
  expenseAmount: { color: colors.foreground, fontSize: 14, fontWeight: '700' },
  link: { color: colors.accentText, fontSize: 14, fontWeight: '700', paddingTop: 6 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.navyOverlay },
  modalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  editor: { maxHeight: '94%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30, gap: 10 },
  editorHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  editorTitle: { color: colors.foreground, fontSize: 20, fontWeight: '800' },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#efeee9' },
  closeText: { color: colors.foreground, fontSize: 26, lineHeight: 30 },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: '#ffffff', color: colors.foreground, paddingHorizontal: 12, fontSize: 15 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  horizontalChips: { flexDirection: 'row', gap: 7, paddingRight: 10 },
  choiceChip: { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: '#ffffff', paddingHorizontal: 11, paddingVertical: 8 },
  choiceChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  choiceText: { color: colors.secondaryText, fontSize: 12, fontWeight: '600' },
  choiceTextActive: { color: '#ffffff' },
  primaryButton: { minHeight: 48, marginTop: 6, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  deleteButton: { minHeight: 44, borderRadius: 14, backgroundColor: colors.destructiveSubtle, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: colors.destructive, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.55 },
})
