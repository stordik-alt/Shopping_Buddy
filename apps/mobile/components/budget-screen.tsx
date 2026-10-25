import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Baby, Bus, Building2, Car, Heart, House, Shirt, ShoppingBag, ShoppingBasket, Sparkles, Ticket, type LucideIcon } from 'lucide-react-native'
import Svg, { Circle, Defs, Path, Pattern, Rect } from 'react-native-svg'
import { EXPENSE_CATEGORY_NAMES, subcategoriesOf, type ExpenseCategory } from '../../../lib/expense-categories'
import {
  addExpense,
  addBudgetIncome,
  addPlannedExpense,
  addRecurringPayment,
  addRecurringIncome,
  addPocket,
  archivePocket,
  closeBudgetPeriod,
  confirmRecurringPayment,
  confirmRecurringIncome,
  deleteBudgetIncome,
  deleteExpense,
  deletePlannedExpense,
  getBudgetSummary,
  getBudgetOverview,
  getBudgetCategoryLimits,
  getBudgetLedger,
  getBudgetHistory,
  getBudgetOutlook,
  getBudgetPeriodSettings,
  getBudgetPlanning,
  getRecurringPayments,
  getRecurringIncomes,
  getExpenses,
  MobileApiError,
  payPlannedExpense,
  receiveBudgetIncome,
  receiveRecurringBudgetIncome,
  reopenBudgetPeriod,
  skipRecurringPayment,
  skipRecurringIncome,
  stopRecurringPayment,
  stopRecurringIncome,
  transferPocket,
  setPlannedCarry,
  updateBudgetIncome,
  updateRecurringPayment,
  updateRecurringIncome,
  updatePocket,
  updateBudgetPeriod,
  updatePlannedExpense,
  updateExpense,
  updateBudgetCategoryLimit,
  type MobileBudgetSummary,
  type MobileBudgetOverview,
  type MobileBudgetPlanning,
  type MobileBudgetIncome,
  type MobileExpense,
  type MobilePlannedExpense,
  type MobileRecurringPayments,
  type MobileRecurringIncomes,
  type MobileBudgetLedger,
  type MobilePeriodSettings,
} from '../lib/shopping-list-api'
import { RefreshButton } from './refresh-button'
import { useMobileTheme } from '../lib/theme'
import { expenseCategoryColor } from '../lib/chart-colors'
import { RecurringPaymentsScreen } from './recurring-payments-screen'
import { RecurringIncomesScreen } from './recurring-incomes-screen'
import { PocketsScreen } from './pockets-screen'
import { BudgetAdvancedScreen } from './budget-advanced-screen'
import type { RecurringPayment, RecurringPaymentInput } from '../../../lib/recurring-payments'
import type { RecurringIncome, RecurringIncomeInput } from '../../../lib/recurring-incomes'
import type { Pocket } from '../../../lib/types'
import type { PocketInput } from '../../../lib/pocket-input'
import type { BudgetOutlook } from '../../../lib/types'
import type { PeriodHistoryRow } from '../../../lib/budget-history'
import type { PeriodConfig } from '../../../lib/budget-period'
import type { PocketAmount } from '../../../lib/budget-closing'
import { spendingDonutSegments } from '../../../lib/budget-chart'

const CATEGORY_ICONS: Record<ExpenseCategory, LucideIcon> = {
  Potraviny: ShoppingBasket,
  Drogerie: Sparkles,
  Domácnost: House,
  Bydlení: Building2,
  Auto: Car,
  Doprava: Bus,
  'Oblečení a obuv': Shirt,
  Děti: Baby,
  Zdraví: Heart,
  'Volný čas': Ticket,
  Ostatní: ShoppingBag,
}

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

function CategoryLimitsEditor({ limits, busy, onClose, onSave }: {
  limits: Partial<Record<ExpenseCategory, number>>
  busy: boolean
  onClose: () => void
  onSave: (changes: { category: ExpenseCategory; amount: number | null }[]) => Promise<void>
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [drafts, setDrafts] = useState(() => Object.fromEntries(EXPENSE_CATEGORY_NAMES.map((category) => [category, limits[category] == null ? '' : String(limits[category]).replace('.', ',')])) as Record<ExpenseCategory, string>)
  const [error, setError] = useState('')

  async function save() {
    const changes: { category: ExpenseCategory; amount: number | null }[] = []
    for (const category of EXPENSE_CATEGORY_NAMES) {
      const raw = drafts[category].replace(/[\s ]/g, '').replace(',', '.')
      const amount = raw === '' ? null : Number(raw)
      if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
        setError(`Limit pro ${category} musí být částka větší než 0, nebo prázdný.`)
        return
      }
      if (amount !== (limits[category] ?? null)) changes.push({ category, amount })
    }
    setError('')
    try { await onSave(changes) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Limity se nepodařilo uložit.') }
  }

  return <Modal animationType="slide" onRequestClose={onClose} transparent visible>
    <View style={styles.modalBackdrop}>
      <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.editor}>
          <View style={styles.editorHeading}><Text style={styles.editorTitle}>Měsíční limity kategorií</Text><Pressable accessibilityLabel="Zavřít limity kategorií" accessibilityRole="button" onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable></View>
          <Text style={styles.supporting}>Při dosažení 80 % a 100 % limitu přijde upozornění. Prázdné pole znamená bez limitu.</Text>
          {EXPENSE_CATEGORY_NAMES.map((category) => <View key={category} style={styles.limitRow}><Text style={styles.limitCategory}>{category}</Text><TextInput accessibilityLabel={`Limit ${category}`} keyboardType="decimal-pad" onChangeText={(value) => setDrafts((current) => ({ ...current, [category]: value }))} placeholder="bez limitu" placeholderTextColor={colors.mutedText} style={styles.limitInput} value={drafts[category]} /><Text style={styles.supporting}>Kč</Text></View>)}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryButtonText}>{busy ? 'Ukládám…' : 'Uložit limity'}</Text></Pressable>
        </View>
      </ScrollView>
    </View>
  </Modal>
}

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
  const styles = useStyles()
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

type PlanningEdit =
  | { kind: 'income'; income?: MobileBudgetIncome; recurringReceive?: boolean }
  | { kind: 'plannedExpense'; plannedExpense?: MobilePlannedExpense }

function PlanningEditor({
  editing,
  currency,
  busy,
  onClose,
  onSaveIncome,
  onReceiveRecurring,
  onSavePlannedExpense,
  onDeleteIncome,
  onDeletePlannedExpense,
}: {
  editing: PlanningEdit
  currency: string
  busy: boolean
  onClose: () => void
  onSaveIncome: (income: MobileBudgetIncome | undefined, input: { amount: number; description: string; date: string; status: 'planned' | 'actual' }) => void
  onReceiveRecurring: (income: MobileBudgetIncome, input: { amount: number; date: string }) => void
  onSavePlannedExpense: (expense: MobilePlannedExpense | undefined, input: { amount: number; note: string; category: ExpenseCategory; date: string }) => void
  onDeleteIncome: (income: MobileBudgetIncome) => void
  onDeletePlannedExpense: (expense: MobilePlannedExpense) => void
}) {
  const styles = useStyles()
  const income = editing.kind === 'income' ? editing.income : undefined
  const plannedExpense = editing.kind === 'plannedExpense' ? editing.plannedExpense : undefined
  const recurringReceive = editing.kind === 'income' && editing.recurringReceive === true
  const [amount, setAmount] = useState(String(income?.amount ?? plannedExpense?.amount ?? '').replace('.', ','))
  const [description, setDescription] = useState(income?.description ?? plannedExpense?.note ?? '')
  const [category, setCategory] = useState<ExpenseCategory>((plannedExpense?.category as ExpenseCategory) ?? 'Ostatní')
  const [date, setDate] = useState(income?.occurrenceDueDate ?? income?.date ?? plannedExpense?.date ?? todayLocal())
  const [status, setStatus] = useState<'planned' | 'actual'>('planned')
  const [error, setError] = useState('')

  function save() {
    const value = Number(amount.replace(/[\s ]/g, '').replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) {
      setError('Zadejte částku větší než 0.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Zadejte datum ve formátu RRRR-MM-DD.')
      return
    }
    setError('')
    if (editing.kind === 'income') {
      if (recurringReceive && income) onReceiveRecurring(income, { amount: value, date })
      else onSaveIncome(income, { amount: value, description, date, status })
    } else {
      onSavePlannedExpense(plannedExpense, { amount: value, note: description, category, date })
    }
  }

  const title = recurringReceive
    ? 'Potvrdit přijatý příjem'
    : editing.kind === 'income'
      ? income ? 'Upravit příjem' : 'Nový příjem'
      : plannedExpense ? 'Upravit plánovaný výdaj' : 'Nový plánovaný výdaj'

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.modalBackdrop}>
        <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.editor}>
            <View style={styles.editorHeading}><Text style={styles.editorTitle}>{title}</Text><Pressable accessibilityLabel="Zavřít formulář" accessibilityRole="button" onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable></View>
            {editing.kind === 'income' && !recurringReceive ? <>
              <Text style={styles.label}>Popis příjmu</Text>
              <TextInput accessibilityLabel="Popis příjmu" onChangeText={setDescription} placeholder="Např. výplata" style={styles.input} value={description} />
            </> : null}
            {editing.kind === 'plannedExpense' ? <>
              <Text style={styles.label}>Popis</Text>
              <TextInput accessibilityLabel="Popis plánovaného výdaje" onChangeText={setDescription} placeholder="Např. servis auta" style={styles.input} value={description} />
              <Text style={styles.label}>Kategorie</Text>
              <View style={styles.chipWrap}>{EXPENSE_CATEGORY_NAMES.map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: category === value }} onPress={() => setCategory(value)} style={[styles.choiceChip, category === value && styles.choiceChipActive]}><Text style={[styles.choiceText, category === value && styles.choiceTextActive]}>{value}</Text></Pressable>)}</View>
            </> : null}
            <Text style={styles.label}>{currency} · částka</Text>
            <TextInput accessibilityLabel="Částka" keyboardType="decimal-pad" onChangeText={setAmount} placeholder="0,00" style={styles.input} value={amount} />
            <Text style={styles.label}>{recurringReceive ? 'Datum přijetí' : 'Datum'}</Text>
            <TextInput accessibilityLabel="Datum" onChangeText={setDate} placeholder="RRRR-MM-DD" style={styles.input} value={date} />
            {editing.kind === 'income' && !income ? <View style={styles.choiceRow}>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: status === 'planned' }} onPress={() => setStatus('planned')} style={[styles.choiceChip, status === 'planned' && styles.choiceChipActive]}><Text style={[styles.choiceText, status === 'planned' && styles.choiceTextActive]}>Plánovaný</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: status === 'actual' }} onPress={() => setStatus('actual')} style={[styles.choiceChip, status === 'actual' && styles.choiceChipActive]}><Text style={[styles.choiceText, status === 'actual' && styles.choiceTextActive]}>Už přijatý</Text></Pressable>
            </View> : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={busy} onPress={save} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryButtonText}>{busy ? 'Ukládám…' : recurringReceive ? 'Potvrdit přijetí' : 'Uložit'}</Text></Pressable>
            {income?.editable ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => onDeleteIncome(income)} style={styles.deleteButton}><Text style={styles.deleteText}>Smazat příjem</Text></Pressable> : null}
            {plannedExpense?.status === 'planned' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => onDeletePlannedExpense(plannedExpense)} style={styles.deleteButton}><Text style={styles.deleteText}>Odebrat z plánu</Text></Pressable> : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

function BudgetPlanningScreen({
  planning,
  busy,
  onEdit,
  onReceive,
  onPay,
}: {
  planning: MobileBudgetPlanning | null
  busy: boolean
  onEdit: (editing: PlanningEdit) => void
  onReceive: (income: MobileBudgetIncome) => void
  onPay: (expense: MobilePlannedExpense) => void
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  if (!planning) return <View style={styles.empty}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.supporting}>Načítání plánování…</Text></View>
  const plannedIncome = planning.incomes.filter((income) => income.status === 'planned')
  const receivedIncome = planning.incomes.filter((income) => income.status === 'actual')
  const openExpenses = planning.plannedExpenses.filter((expense) => expense.status === 'planned')
  const paidExpenses = planning.plannedExpenses.filter((expense) => expense.status === 'paid')
  return <View style={styles.section}>
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Příjmy</Text>
      <View style={styles.planTotals}><Text style={styles.supporting}>Očekávané</Text><Text style={styles.value}>{money(plannedIncome.reduce((sum, income) => sum + income.amount, 0), planning.currency)}</Text></View>
      <View style={styles.planTotals}><Text style={styles.supporting}>Přijaté</Text><Text style={styles.value}>{money(receivedIncome.reduce((sum, income) => sum + income.amount, 0), planning.currency)}</Text></View>
      <Pressable accessibilityRole="button" onPress={() => onEdit({ kind: 'income' })} style={styles.inlineAdd}><Text style={styles.link}>＋ Přidat příjem</Text></Pressable>
    </View>
    {planning.incomes.length === 0 ? <View style={styles.emptyCard}><Text style={styles.supporting}>Pro toto období zatím nejsou naplánované příjmy.</Text></View> : planning.incomes.map((income) => {
      const recurring = income.recurringIncomeId !== null
      const canReceive = income.date <= todayLocal()
      return <View key={income.id} style={styles.planRow}>
        <Pressable accessibilityRole={income.editable ? 'button' : undefined} disabled={!income.editable} onPress={() => onEdit({ kind: 'income', income })} style={styles.planCopy}>
          <Text numberOfLines={1} style={styles.expenseNote}>{income.description || 'Příjem'}</Text>
          <Text style={styles.supporting}>{income.status === 'actual' ? 'Přijato' : `Očekáváno ${dateLabel(income.date)}`}{recurring ? ' · pravidelný příjem' : ''}</Text>
        </Pressable>
        <Text style={styles.expenseAmount}>{money(income.amount, planning.currency)}</Text>
        {income.status === 'planned' && canReceive ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => recurring ? onEdit({ kind: 'income', income, recurringReceive: true }) : onReceive(income)} style={styles.smallAction}><Text style={styles.smallActionText}>Přijato</Text></Pressable> : null}
      </View>
    })}

    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Plánované výdaje</Text>
      <View style={styles.planTotals}><Text style={styles.supporting}>Čeká na zaplacení</Text><Text style={styles.value}>{money(openExpenses.reduce((sum, expense) => sum + expense.amount, 0), planning.currency)}</Text></View>
      <Pressable accessibilityRole="button" onPress={() => onEdit({ kind: 'plannedExpense' })} style={styles.inlineAdd}><Text style={styles.link}>＋ Přidat plánovaný výdaj</Text></Pressable>
    </View>
    {planning.plannedExpenses.length === 0 ? <View style={styles.emptyCard}><Text style={styles.supporting}>Pro toto období zatím nejsou plánované výdaje.</Text></View> : planning.plannedExpenses.map((expense) => (
      <View key={expense.id} style={styles.planRow}>
        <Pressable accessibilityRole={expense.status === 'planned' ? 'button' : undefined} disabled={expense.status === 'paid'} onPress={() => onEdit({ kind: 'plannedExpense', plannedExpense: expense })} style={styles.planCopy}>
          <Text numberOfLines={1} style={styles.expenseNote}>{expense.note || expense.category}</Text>
          <Text style={styles.supporting}>{expense.status === 'paid' ? 'Zaplaceno' : `${expense.category} · ${dateLabel(expense.date)}`}</Text>
        </Pressable>
        <Text style={styles.expenseAmount}>{money(expense.amount, planning.currency)}</Text>
        {expense.status === 'planned' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => onPay(expense)} style={styles.smallAction}><Text style={styles.smallActionText}>Zaplaceno</Text></Pressable> : null}
      </View>
    ))}
    {paidExpenses.length > 0 ? <Text style={styles.supporting}>{paidExpenses.length} plánovaných výdajů už bylo zaplaceno a započítáno do skutečných výdajů.</Text> : null}
    <Text style={styles.note}>Plánované částky se nepočítají do skutečného zůstatku, dokud příjem nepotvrdíte nebo výdaj nezaplatíte.</Text>
  </View>
}

export function BudgetScreen({ onAuthExpired, quickAddExpenseToken = 0, canManageBudget = false }: { onAuthExpired: () => void; quickAddExpenseToken?: number; canManageBudget?: boolean }) {
  const { colors, theme } = useMobileTheme()
  const styles = useStyles()
  const [summary, setSummary] = useState<MobileBudgetSummary | null>(null)
  const [overview, setOverview] = useState<MobileBudgetOverview | null>(null)
  const [categoryLimits, setCategoryLimits] = useState<Partial<Record<ExpenseCategory, number>>>({})
  const [planning, setPlanning] = useState<MobileBudgetPlanning | null>(null)
  const [recurring, setRecurring] = useState<MobileRecurringPayments | null>(null)
  const [recurringIncomes, setRecurringIncomes] = useState<MobileRecurringIncomes | null>(null)
  const [ledger, setLedger] = useState<MobileBudgetLedger | null>(null)
  const [periodSettings, setPeriodSettings] = useState<MobilePeriodSettings | null>(null)
  const [outlook, setOutlook] = useState<BudgetOutlook | null>(null)
  const [history, setHistory] = useState<PeriodHistoryRow[] | null>(null)
  const [expenses, setExpenses] = useState<MobileExpense[]>([])
  const [period, setPeriod] = useState<{ start: string; end: string; next: string } | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null)
  const selectedPeriodRef = useRef<string | null>(null)
  const [view, setView] = useState<'overview' | 'expenses' | 'planning' | 'recurring'>('overview')
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | null>(null)
  const [editorExpense, setEditorExpense] = useState<MobileExpense | null>(null)
  const [editingPlan, setEditingPlan] = useState<PlanningEdit | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [limitsOpen, setLimitsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [advancedRefreshKey, setAdvancedRefreshKey] = useState(0)

  useEffect(() => {
    if (view !== 'planning') return
    let cancelled = false
    Promise.all([getBudgetPeriodSettings(), getBudgetOutlook(), getBudgetHistory()]).then(([settings, nextOutlook, nextHistory]) => {
      if (cancelled) return
      setPeriodSettings(settings)
      setOutlook(nextOutlook.outlook)
      setHistory(nextHistory.history)
    }).catch((caught) => {
      if (cancelled) return
      setError(caught instanceof Error ? caught.message : 'Rozšířený plán rozpočtu se nepodařilo načíst.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    })
    return () => { cancelled = true }
  }, [view, advancedRefreshKey, onAuthExpired])

  useEffect(() => {
    if (quickAddExpenseToken > 0) {
      setView('overview')
      setEditorExpense(null)
      setEditorOpen(true)
    }
  }, [quickAddExpenseToken])

  const load = useCallback(async (requestedPeriod?: string) => {
    setLoading(true)
    setError(null)
    try {
      const [nextSummary, nextPlanning, nextLimits, nextRecurring, nextRecurringIncomes, nextLedger, nextOverview] = await Promise.all([getBudgetSummary(), getBudgetPlanning(requestedPeriod ?? selectedPeriodRef.current ?? undefined), getBudgetCategoryLimits(), getRecurringPayments(), getRecurringIncomes(), getBudgetLedger(requestedPeriod ?? selectedPeriodRef.current ?? undefined), getBudgetOverview()])
      setSummary(nextSummary)
      setPlanning(nextPlanning)
      setCategoryLimits(nextLimits.limits)
      setRecurring(nextRecurring)
      setRecurringIncomes(nextRecurringIncomes)
      setLedger(nextLedger)
      setOverview(nextOverview)
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

  async function mutatePlanning(action: () => Promise<unknown>) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await action()
      setEditingPlan(null)
      await load(selectedPeriod ?? period?.start)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Plán rozpočtu se nepodařilo uložit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally { setSaving(false) }
  }

  async function saveCategoryLimits(changes: { category: ExpenseCategory; amount: number | null }[]) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      let latest = categoryLimits
      for (const change of changes) latest = (await updateBudgetCategoryLimit(change.category, change.amount)).limits
      setCategoryLimits(latest)
      setLimitsOpen(false)
      await load(selectedPeriod ?? period?.start)
    } catch (caught) {
      try { setCategoryLimits((await getBudgetCategoryLimits()).limits) } catch { /* retain the last values if the refresh also fails */ }
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
      throw caught
    } finally { setSaving(false) }
  }

  async function mutateRecurring(action: () => Promise<unknown>) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await action()
      await load(selectedPeriod ?? period?.start)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Pravidelnou platbu se nepodařilo uložit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
      throw caught
    } finally { setSaving(false) }
  }

  function saveRecurring(payment: RecurringPayment | null, input: RecurringPaymentInput) {
    return mutateRecurring(() => payment ? updateRecurringPayment(payment.id, input) : addRecurringPayment(input))
  }

  async function mutateRecurringIncome(action: () => Promise<unknown>) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await action()
      await load(selectedPeriod ?? period?.start)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Pravidelný příjem se nepodařilo uložit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
      throw caught
    } finally { setSaving(false) }
  }

  function saveRecurringIncome(income: RecurringIncome | null, input: RecurringIncomeInput) {
    return mutateRecurringIncome(() => income ? updateRecurringIncome(income.id, input) : addRecurringIncome(input))
  }

  async function mutatePocket(action: () => Promise<unknown>) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await action()
      await load(selectedPeriod ?? period?.start)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Kapsu se nepodařilo uložit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
      throw caught
    } finally { setSaving(false) }
  }

  function savePocket(pocket: Pocket | null, input: PocketInput) {
    return mutatePocket(() => pocket ? updatePocket(pocket.id, input) : addPocket(input))
  }

  async function mutateAdvanced(action: () => Promise<unknown>) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await action()
      await load(selectedPeriod ?? period?.start)
      setAdvancedRefreshKey((key) => key + 1)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Plán období se nepodařilo uložit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
      throw caught
    } finally { setSaving(false) }
  }

  function openHistoryExpenses(periodStart: string) {
    setCategoryFilter(null)
    setView('expenses')
    void load(periodStart)
  }

  function saveIncome(income: MobileBudgetIncome | undefined, input: { amount: number; description: string; date: string; status: 'planned' | 'actual' }) {
    void mutatePlanning(() => income ? updateBudgetIncome(income.id, input) : addBudgetIncome(input))
  }
  function receiveIncome(income: MobileBudgetIncome, input: { amount: number; date: string }) {
    void mutatePlanning(() => income.recurringIncomeId ? receiveRecurringBudgetIncome(income.id, input.amount, input.date) : receiveBudgetIncome(income.id, input.date))
  }
  function savePlannedExpense(expense: MobilePlannedExpense | undefined, input: { amount: number; note: string; category: ExpenseCategory; date: string }) {
    void mutatePlanning(() => expense ? updatePlannedExpense(expense.id, input) : addPlannedExpense(input))
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
  const visibleExpenses = categoryFilter ? expenses.filter((expense) => expense.category === categoryFilter) : expenses
  const total = visibleExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const donutSegments = summary ? spendingDonutSegments(summary.categories.map((category) => ({ category: category.category as ExpenseCategory, total: category.total }))) : []

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
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === 'planning' }} onPress={() => setView('planning')} style={[styles.switchTab, view === 'planning' && styles.switchTabActive]}><Text style={[styles.switchText, view === 'planning' && styles.switchTextActive]}>Plán</Text></Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === 'recurring' }} onPress={() => setView('recurring')} style={[styles.switchTab, view === 'recurring' && styles.switchTabActive]}><Text style={[styles.switchText, view === 'recurring' && styles.switchTextActive]}>Pravidelné</Text></Pressable>
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
            {overview ? <View style={styles.card}>
              <Text style={styles.sectionTitle}>Srovnání a očekávání</Text>
              {overview.comparison ? <View style={styles.budgetInsight}><Text style={styles.label}>{overview.comparison.changePercent <= 0 ? 'Utrácíte méně' : 'Utrácíte více'} než ve stejné části minulého období</Text><Text style={styles.value}>{money(overview.comparison.current, summary.currency)} oproti {money(overview.comparison.previous, summary.currency)} ({overview.comparison.changePercent > 0 ? '+' : ''}{overview.comparison.changePercent.toFixed(0)} %)</Text></View> : <Text style={styles.supporting}>Srovnání se zobrazí, až budou výdaje zaznamenané i v předchozím období.</Text>}
              <View style={styles.row}><Text style={styles.supporting}>Odhad do konce období</Text><Text style={styles.value}>{money(overview.projected, summary.currency)}</Text></View>
              <View style={styles.row}><Text style={styles.supporting}>Plánovaný nákup</Text><Text style={styles.value}>{money(overview.planned, summary.currency)}</Text></View>
              <View style={styles.row}><Text style={styles.supporting}>Skutečné výdaje</Text><Text style={styles.value}>{money(summary.spent, summary.currency)}</Text></View>
            </View> : null}
            {overview?.savings.length ? <View style={styles.card}>
              <Text style={styles.sectionTitle}>Ušetřeno nákupy</Text>
              {overview.savings.slice(0, 6).map((row) => <View key={row.month} style={styles.savingsRow}><Text style={styles.label}>{new Date(`${row.month}-01T12:00:00`).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })}</Text><View style={styles.savingsAmounts}><Text style={styles.supporting}>Účtenky {money(row.receiptReported, summary.currency)}</Text><Text style={styles.supporting}>Zadané slevy {money(row.declared, summary.currency)}</Text></View></View>)}
              <Text style={styles.note}>Slevy na účtenkách jsou ověřené; ručně zadané slevy jsou vedené zvlášť.</Text>
            </View> : null}
            {summary.categories.length > 0 ? <View style={styles.chartCard}>
              <View style={styles.chartHeading}><Text style={styles.sectionTitle}>Struktura výdajů</Text><Text style={styles.supporting}>{summary.categories.length} kategorií</Text></View>
              <View style={styles.donutWrap}>
                <Svg height={148} width={148} viewBox="0 0 120 120">
                  <Defs>
                    <Pattern height={6} id="mobile-budget-other-pattern" patternUnits="userSpaceOnUse" width={6}>
                      <Rect fill={colors.muted} height={6} width={6} x={0} y={0} />
                      <Path d="M-2 2 L2 -2 M0 6 L6 0 M4 8 L8 4" fill="none" stroke={colors.mutedText} strokeWidth={1.5} />
                    </Pattern>
                  </Defs>
                  <Circle cx="60" cy="60" r="46" fill="none" stroke={colors.muted} strokeWidth="13" />
                  {donutSegments.map((segment, index) => {
                    const circumference = 2 * Math.PI * 46
                    const ratio = summary.spent > 0 ? Math.max(0, segment.total) / summary.spent : 0
                    const offset = donutSegments.slice(0, index).reduce((sum, row) => sum + (summary.spent > 0 ? Math.max(0, row.total) / summary.spent : 0), 0) * circumference
                    const stroke = segment.kind === 'category' ? expenseCategoryColor(segment.category, theme) : 'url(#mobile-budget-other-pattern)'
                    return <Circle key={segment.kind === 'category' ? segment.category : 'other'} cx="60" cy="60" r="46" fill="none" stroke={stroke} strokeWidth="13" strokeDasharray={`${ratio * circumference} ${circumference}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
                  })}
                </Svg>
                <View style={styles.donutCenter}><Text style={styles.supporting}>Celkem</Text><Text style={styles.donutValue}>{money(summary.spent, summary.currency)}</Text></View>
              </View>
              <View style={styles.legend}>{summary.categories.map((category) => {
                const Icon = CATEGORY_ICONS[category.category as ExpenseCategory]
                return <Pressable key={category.category} accessibilityRole="button" accessibilityLabel={`${category.category}, ${money(category.total, summary.currency)}, ${summary.spent > 0 ? Math.round(category.total / summary.spent * 100) : 0} procent. Zobrazit výdaje této kategorie.`} onPress={() => { setCategoryFilter(category.category as ExpenseCategory); setView('expenses') }} style={styles.legendRow}><Icon color={expenseCategoryColor(category.category, theme)} size={17} /><Text numberOfLines={1} style={styles.legendName}>{category.category}</Text><View style={styles.legendAmount}><Text style={styles.legendValue}>{money(category.total, summary.currency)}</Text><Text style={styles.legendShare}>{summary.spent > 0 ? `${Math.round(category.total / summary.spent * 100)} %` : '0 %'}</Text></View></Pressable>
              })}</View>
            </View> : null}
            <View style={styles.section}>
              <View style={styles.sectionHeadingRow}><Text style={styles.sectionTitle}>Výdaje podle kategorií</Text><Pressable accessibilityRole="button" onPress={() => setLimitsOpen(true)} style={styles.limitEditButton}><Text style={styles.limitEditText}>Upravit limity</Text></Pressable></View>
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
            {categoryFilter ? <View style={styles.filterRow}><Text style={styles.supporting}>Kategorie: {categoryFilter}</Text><Pressable accessibilityRole="button" onPress={() => setCategoryFilter(null)}><Text style={styles.link}>Zobrazit vše</Text></Pressable></View> : <View style={styles.categoryFilters}>{(['Vše', ...EXPENSE_CATEGORY_NAMES] as const).map((category) => {
              const selected = category === 'Vše' ? categoryFilter === null : categoryFilter === category
              return <Pressable key={category} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setCategoryFilter(category === 'Vše' ? null : category)} style={[styles.categoryFilter, selected && styles.categoryFilterActive]}><Text style={[styles.categoryFilterText, selected && styles.categoryFilterTextActive]}>{category}</Text></Pressable>
            })}</View>}
            <View style={styles.totalCard}><Text style={styles.supporting}>{categoryFilter ? `Celkem v kategorii ${categoryFilter}` : 'Celkem za období'}</Text><Text style={styles.budget}>{money(total, summary?.currency ?? 'CZK')}</Text></View>
            {visibleExpenses.length === 0 ? <View style={styles.emptyCard}><Text style={styles.sectionTitle}>{categoryFilter ? `V kategorii ${categoryFilter} nejsou výdaje` : 'V tomto období zatím nejsou výdaje'}</Text><Pressable accessibilityRole="button" onPress={() => { setEditorExpense(null); setEditorOpen(true) }}><Text style={styles.link}>Zapsat první výdaj</Text></Pressable></View> : visibleExpenses.map((expense) => (
              <Pressable key={expense.id} accessibilityRole="button" accessibilityLabel={`${expense.editable ? 'Upravit' : 'Zobrazit'} výdaj ${expense.note || expense.category}`} onPress={() => { if (expense.editable) { setEditorExpense(expense); setEditorOpen(true) } else Alert.alert('Výdaj z účtenky', `${expense.note || expense.category}\n${expense.category} · ${dateLabel(expense.date)}`) }} style={styles.expenseRow}>
                <View style={styles.expenseText}><Text numberOfLines={1} style={styles.expenseNote}>{expense.note || expense.category}</Text><Text style={styles.supporting}>{expense.category}{expense.subcategory ? ` · ${expense.subcategory}` : ''} · {dateLabel(expense.date)}{expense.editable ? '' : ' · účtenka'}</Text></View>
                <Text style={styles.expenseAmount}>{money(expense.amount, summary?.currency ?? 'CZK')}</Text>
              </Pressable>
            ))}
          </View>
        ) : view === 'planning' ? <View style={styles.section}><BudgetPlanningScreen
          busy={saving}
          onEdit={setEditingPlan}
          onPay={(expense) => { Alert.alert('Označit jako zaplacené?', `${expense.note || expense.category} · ${money(expense.amount, planning?.currency ?? 'CZK')}`, [{ text: 'Zrušit', style: 'cancel' }, { text: 'Zaplaceno', onPress: () => void mutatePlanning(() => payPlannedExpense(expense.id)) }]) }}
          onReceive={(income) => { Alert.alert('Potvrdit přijatý příjem?', `${income.description} · ${money(income.amount, planning?.currency ?? 'CZK')}`, [{ text: 'Zrušit', style: 'cancel' }, { text: 'Přijato', onPress: () => void mutatePlanning(() => receiveBudgetIncome(income.id)) }]) }}
          planning={planning}
        />{recurringIncomes ? <RecurringIncomesScreen
          busy={saving}
          currency={planning?.currency ?? summary?.currency ?? 'CZK'}
          onConfirm={(id, dueDate, amount, date) => mutateRecurringIncome(() => confirmRecurringIncome(id, dueDate, amount, date))}
          onSave={saveRecurringIncome}
          onSkip={(id, dueDate) => mutateRecurringIncome(() => skipRecurringIncome(id, dueDate))}
          onStop={(income) => mutateRecurringIncome(() => stopRecurringIncome(income.id))}
          occurrences={recurringIncomes.occurrences}
          payments={recurringIncomes.payments}
          today={recurringIncomes.today}
        /> : <View style={styles.empty}><ActivityIndicator color={colors.primary} /><Text style={styles.supporting}>Načítání pravidelných příjmů…</Text></View>}{ledger ? <PocketsScreen
          availableToSave={ledger.availableToSave}
          busy={saving}
          currency={summary?.currency ?? 'CZK'}
          onArchive={(pocket) => mutatePocket(() => archivePocket(pocket.id))}
          onSave={savePocket}
          onTransfer={(pocket, direction, amount) => mutatePocket(() => transferPocket(pocket.id, direction, amount))}
          pockets={ledger.pockets}
        /> : <View style={styles.empty}><ActivityIndicator color={colors.primary} /><Text style={styles.supporting}>Načítání Kapes…</Text></View>}{ledger ? <BudgetAdvancedScreen
          canManage={canManageBudget}
          currency={summary?.currency ?? 'CZK'}
          history={history}
          ledger={ledger}
          onClosePeriod={(input) => mutateAdvanced(() => closeBudgetPeriod(input))}
          onOpenExpenses={openHistoryExpenses}
          onReopenPeriod={(periodStart) => mutateAdvanced(() => reopenBudgetPeriod(periodStart))}
          onSaveCarry={(periodStart, amount) => mutateAdvanced(() => setPlannedCarry(periodStart, amount))}
          onSavePeriod={(nextPeriod: PeriodConfig) => mutateAdvanced(() => updateBudgetPeriod(nextPeriod))}
          outlook={outlook}
          occurrences={recurring?.occurrences ?? []}
          payments={recurring?.payments ?? []}
          settings={periodSettings}
          busy={saving}
        /> : <View style={styles.empty}><ActivityIndicator color={colors.primary} /><Text style={styles.supporting}>Načítání přehledu období…</Text></View>}</View> : view === 'recurring' ? recurring ? <RecurringPaymentsScreen
          busy={saving}
          currency={summary?.currency ?? 'CZK'}
          onConfirm={(id, dueDate, amount, date) => mutateRecurring(() => confirmRecurringPayment(id, dueDate, amount, date))}
          onSave={saveRecurring}
          onSkip={(id, dueDate) => mutateRecurring(() => skipRecurringPayment(id, dueDate))}
          onStop={(payment) => mutateRecurring(() => stopRecurringPayment(payment.id))}
          occurrences={recurring.occurrences}
          payments={recurring.payments}
          today={recurring.today}
        /> : <View style={styles.empty}><ActivityIndicator color={colors.primary} /><Text style={styles.supporting}>Načítání pravidelných plateb…</Text></View> : null}
      </ScrollView>
      {editorOpen ? <ExpenseEditor currency={summary?.currency ?? 'CZK'} expense={editorExpense} busy={saving} onClose={() => { if (!saving) { setEditorOpen(false); setEditorExpense(null) } }} onDelete={confirmDelete} onSave={(draft) => void saveExpense(draft)} /> : null}
      {limitsOpen ? <CategoryLimitsEditor busy={saving} limits={categoryLimits} onClose={() => { if (!saving) setLimitsOpen(false) }} onSave={saveCategoryLimits} /> : null}
      {editingPlan ? <PlanningEditor
        busy={saving}
        currency={planning?.currency ?? 'CZK'}
        editing={editingPlan}
        onClose={() => { if (!saving) setEditingPlan(null) }}
        onDeleteIncome={(income) => Alert.alert('Odebrat příjem?', income.description, [{ text: 'Zrušit', style: 'cancel' }, { text: 'Odebrat', style: 'destructive', onPress: () => void mutatePlanning(() => deleteBudgetIncome(income.id)) }])}
        onDeletePlannedExpense={(expense) => Alert.alert('Odebrat plánovaný výdaj?', expense.note, [{ text: 'Zrušit', style: 'cancel' }, { text: 'Odebrat', style: 'destructive', onPress: () => void mutatePlanning(() => deletePlannedExpense(expense.id)) }])}
        onReceiveRecurring={(income, input) => receiveIncome(income, input)}
        onSaveIncome={saveIncome}
        onSavePlannedExpense={savePlannedExpense}
      /> : null}
    </>
  )
}

function useStyles() {
  const { colors } = useMobileTheme()
  return useMemo(() => StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  heading: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headingText: { flex: 1, minWidth: 0 },
  title: { color: colors.foreground, fontSize: 20, fontWeight: '700' },
  supporting: { color: colors.secondaryText, fontSize: 13, lineHeight: 19, marginTop: 4 },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
  chartCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
  chartHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  donutWrap: { width: 148, height: 148, alignSelf: 'center', justifyContent: 'center', alignItems: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  donutValue: { color: colors.foreground, fontSize: 16, fontWeight: '800' },
  legend: { gap: 7 },
  legendRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 5 },
  legendName: { flex: 1, color: colors.secondaryText, fontSize: 12 },
  legendAmount: { alignItems: 'flex-end' },
  legendValue: { color: colors.foreground, fontSize: 12, fontWeight: '700' },
  legendShare: { color: colors.mutedText, fontSize: 11 },
  label: { color: colors.secondaryText, fontSize: 14, fontWeight: '600', marginTop: 2 },
  budget: { color: colors.foreground, fontSize: 28, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  value: { color: colors.foreground, fontSize: 15, fontWeight: '700' },
  remaining: { color: colors.accentText, fontSize: 18, fontWeight: '800' },
  over: { color: colors.destructive },
  progressTrack: { height: 8, overflow: 'hidden', borderRadius: 8, backgroundColor: colors.muted, marginTop: 5 },
  progress: { height: '100%', borderRadius: 8, backgroundColor: colors.accent },
  progressWarning: { backgroundColor: colors.warning },
  progressOver: { backgroundColor: colors.destructive },
  section: { gap: 10 },
  sectionHeadingRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  budgetInsight: { gap: 4, paddingVertical: 6 },
  savingsRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 9 },
  savingsAmounts: { alignItems: 'flex-end', gap: 3 },
  sectionTitle: { color: colors.foreground, fontSize: 17, fontWeight: '700', marginBottom: 2 },
  limitEditButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 11, backgroundColor: colors.accentSubtle },
  limitEditText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
  limitRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  limitCategory: { flex: 1, color: colors.foreground, fontSize: 13, fontWeight: '600' },
  limitInput: { width: 118, minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.elevated, color: colors.foreground, paddingHorizontal: 10, textAlign: 'right', fontSize: 14 },
  category: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 14, gap: 4 },
  categoryName: { color: colors.foreground, flex: 1, fontSize: 15, fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  emptyCard: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 22, gap: 8 },
  error: { color: colors.destructive, backgroundColor: colors.destructiveSubtle, borderRadius: 12, padding: 12, fontSize: 14, lineHeight: 20 },
  switcher: { padding: 4, flexDirection: 'row', borderRadius: 14, backgroundColor: colors.muted, gap: 4 },
  switchTab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  switchTabActive: { backgroundColor: colors.card },
  switchText: { color: colors.secondaryText, fontSize: 14, fontWeight: '600' },
  switchTextActive: { color: colors.foreground },
  addButton: { backgroundColor: colors.accentSubtle, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9 },
  addButtonText: { color: colors.accentText, fontWeight: '700', fontSize: 13 },
  periodControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  filterRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 4 },
  categoryFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  categoryFilter: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 17, backgroundColor: colors.card },
  categoryFilterActive: { borderColor: colors.primary, backgroundColor: colors.accentSubtle },
  categoryFilterText: { color: colors.secondaryText, fontSize: 12, fontWeight: '600' },
  categoryFilterTextActive: { color: colors.accentText },
  periodTitle: { flex: 1, textAlign: 'center', fontSize: 13, color: colors.secondaryText, fontWeight: '600' },
  periodButton: { paddingHorizontal: 8, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.card },
  periodButtonText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
  periodDisabled: { opacity: 0.35 },
  totalCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 3 },
  expenseRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: colors.card, borderRadius: 15, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10 },
  expenseText: { flex: 1, minWidth: 0 },
  expenseNote: { color: colors.foreground, fontSize: 14, fontWeight: '700' },
  expenseAmount: { color: colors.foreground, fontSize: 14, fontWeight: '700' },
  link: { color: colors.accentText, fontSize: 14, fontWeight: '700', paddingTop: 6 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.navyOverlay },
  modalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  editor: { maxHeight: '94%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30, gap: 10 },
  editorHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  editorTitle: { color: colors.foreground, fontSize: 20, fontWeight: '800' },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted },
  closeText: { color: colors.foreground, fontSize: 26, lineHeight: 30 },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.elevated, color: colors.foreground, paddingHorizontal: 12, fontSize: 15 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  horizontalChips: { flexDirection: 'row', gap: 7, paddingRight: 10 },
  choiceChip: { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 11, paddingVertical: 8 },
  choiceChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  choiceText: { color: colors.secondaryText, fontSize: 12, fontWeight: '600' },
  choiceTextActive: { color: colors.primaryForeground },
  primaryButton: { minHeight: 48, marginTop: 6, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' },
  deleteButton: { minHeight: 44, borderRadius: 14, backgroundColor: colors.destructiveSubtle, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: colors.destructive, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  planTotals: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  inlineAdd: { alignSelf: 'flex-start', paddingVertical: 2 },
  planRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14 },
  planCopy: { flex: 1, minWidth: 0 },
  smallAction: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 11, backgroundColor: colors.accentSubtle },
  smallActionText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
  note: { color: colors.mutedText, fontSize: 12, lineHeight: 18, paddingHorizontal: 3 },
}), [colors])
}
