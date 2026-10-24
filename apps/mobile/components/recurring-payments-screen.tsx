import { useState } from 'react'
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { CalendarClock, Check, Plus, Repeat, SkipForward, X } from 'lucide-react-native'
import { EXPENSE_CATEGORY_NAMES, subcategoriesOf, type ExpenseCategory } from '../../../lib/expense-categories'
import { INTERVAL_LABELS, RECURRING_INTERVALS, recurringOverview, type RecurringInterval, type RecurringOccurrence, type RecurringPayment, type RecurringPaymentInput } from '../../../lib/recurring-payments'
import { useMobileTheme } from '../lib/theme'

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount) } catch { return `${amount.toLocaleString('cs-CZ')} ${currency}` }
}

function shortDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })
}

function parseAmount(value: string) {
  return Number(value.replace(/[\s ]/g, '').replace(',', '.'))
}

function PaymentEditor({ payment, today, currency, busy, onClose, onSave, onStop }: {
  payment: RecurringPayment | null
  today: string
  currency: string
  busy: boolean
  onClose: () => void
  onSave: (input: RecurringPaymentInput) => Promise<void>
  onStop: (payment: RecurringPayment) => Promise<void> | void
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [name, setName] = useState(payment?.name ?? '')
  const [amount, setAmount] = useState(payment ? String(payment.amount).replace('.', ',') : '')
  const [category, setCategory] = useState<ExpenseCategory>(payment?.category ?? 'Bydlení')
  const [subcategory, setSubcategory] = useState(payment?.subcategory ?? '')
  const [intervalMonths, setIntervalMonths] = useState<RecurringInterval>(payment?.intervalMonths ?? 1)
  const [startDate, setStartDate] = useState(payment?.startDate ?? today)
  const [error, setError] = useState('')

  async function save() {
    const parsedAmount = parseAmount(amount)
    if (!name.trim()) return setError('Zadejte název platby.')
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return setError('Zadejte částku větší než 0.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return setError('Zadejte datum ve formátu RRRR-MM-DD.')
    setError('')
    try {
      await onSave({ name, amount: parsedAmount, category, subcategory: subcategory || null, intervalMonths, startDate })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Platbu se nepodařilo uložit.')
    }
  }

  return <Modal animationType="slide" onRequestClose={onClose} transparent visible>
    <View style={styles.backdrop}>
      <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.editor}>
          <View style={styles.headingRow}>
            <View style={styles.flex}>
              <Text style={styles.title}>{payment ? 'Upravit pravidelnou platbu' : 'Nová pravidelná platba'}</Text>
              <Text style={styles.supporting}>Platba se do rozpočtu započítá až po potvrzení.</Text>
            </View>
            <Pressable accessibilityLabel="Zavřít formulář" accessibilityRole="button" onPress={onClose} style={styles.closeButton}><X color={colors.foreground} size={20} /></Pressable>
          </View>
          <Text style={styles.label}>Název platby</Text>
          <TextInput accessibilityLabel="Název platby" autoCapitalize="sentences" onChangeText={setName} placeholder="Např. nájem, elektřina" placeholderTextColor={colors.mutedText} style={styles.input} value={name} />
          <View style={styles.twoColumns}>
            <View style={styles.flex}>
              <Text style={styles.label}>Částka ({currency})</Text>
              <TextInput accessibilityLabel="Částka pravidelné platby" keyboardType="decimal-pad" onChangeText={setAmount} placeholder="0,00" placeholderTextColor={colors.mutedText} style={styles.input} value={amount} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.label}>Četnost</Text>
              <View style={styles.choiceWrap}>{RECURRING_INTERVALS.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: intervalMonths === value }} onPress={() => setIntervalMonths(value)} style={[styles.chip, intervalMonths === value && styles.chipActive]}><Text style={[styles.chipText, intervalMonths === value && styles.chipTextActive]}>{INTERVAL_LABELS[value]}</Text></Pressable>)}</View>
            </View>
          </View>
          <Text style={styles.label}>Kategorie</Text>
          <View style={styles.choiceWrap}>{EXPENSE_CATEGORY_NAMES.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: category === value }} onPress={() => { setCategory(value); setSubcategory('') }} style={[styles.chip, category === value && styles.chipActive]}><Text style={[styles.chipText, category === value && styles.chipTextActive]}>{value}</Text></Pressable>)}</View>
          <Text style={styles.label}>Podkategorie</Text>
          <View style={styles.choiceWrap}>
            <Pressable accessibilityRole="radio" accessibilityState={{ checked: !subcategory }} onPress={() => setSubcategory('')} style={[styles.chip, !subcategory && styles.chipActive]}><Text style={[styles.chipText, !subcategory && styles.chipTextActive]}>Bez podkategorie</Text></Pressable>
            {subcategoriesOf(category).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: subcategory === value }} onPress={() => setSubcategory(value)} style={[styles.chip, subcategory === value && styles.chipActive]}><Text style={[styles.chipText, subcategory === value && styles.chipTextActive]}>{value}</Text></Pressable>)}
          </View>
          <Text style={styles.label}>První splatnost (RRRR-MM-DD)</Text>
          <TextInput accessibilityLabel="První splatnost" onChangeText={setStartDate} placeholder="RRRR-MM-DD" placeholderTextColor={colors.mutedText} style={styles.input} value={startDate} />
          <Text style={styles.note}>Den v měsíci se zachová i u dalších splatností.</Text>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryButtonText}>{busy ? 'Ukládám…' : payment ? 'Uložit změny' : 'Přidat platbu'}</Text></Pressable>
          {payment?.active ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => onStop(payment)} style={[styles.stopButton, busy && styles.disabled]}><Text style={styles.stopText}>Zastavit platbu</Text><Text style={styles.note}>Dosavadní výdaje zůstanou zachované.</Text></Pressable> : null}
        </View>
      </ScrollView>
    </View>
  </Modal>
}

function DueRow({ payment, dueDate, today, currency, busy, onConfirm, onSkip }: {
  payment: RecurringPayment
  dueDate: string
  today: string
  currency: string
  busy: boolean
  onConfirm: (id: string, dueDate: string, amount: number, date: string) => Promise<void>
  onSkip: (id: string, dueDate: string) => Promise<void>
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [confirming, setConfirming] = useState(false)
  const [amount, setAmount] = useState(String(payment.amount).replace('.', ','))
  const [date, setDate] = useState(dueDate)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const overdue = dueDate < today

  async function confirm() {
    const parsed = parseAmount(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) return setError('Zadejte částku větší než 0.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return setError('Zadejte platné datum nejpozději dnes.')
    setSaving(true); setError('')
    try { await onConfirm(payment.id, dueDate, parsed, date) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Platbu se nepodařilo potvrdit.') } finally { setSaving(false) }
  }

  async function skip() {
    setSaving(true); setError('')
    try { await onSkip(payment.id, dueDate) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Platbu se nepodařilo přeskočit.') } finally { setSaving(false) }
  }

  return <View style={styles.dueCard}>
    <View style={styles.rowBetween}>
      <View style={styles.flex}><Text style={styles.paymentName}>{payment.name}</Text><Text style={styles.supporting}>{overdue ? `Splatné ${shortDate(dueDate)}` : 'Splatné dnes'} · {payment.subcategory ?? payment.category}</Text></View>
      <Text style={styles.paymentAmount}>{money(payment.amount, currency)}</Text>
    </View>
    {confirming ? <View style={styles.confirmForm}>
      <Text style={styles.paymentName}>Kolik jste skutečně zaplatili?</Text>
      <Text style={styles.supporting}>Plánovaná částka je {money(payment.amount, currency)}. Upravte ji, pokud se platba lišila.</Text>
      <TextInput accessibilityLabel={`Skutečně zaplacená částka ${payment.name}`} keyboardType="decimal-pad" onChangeText={setAmount} placeholderTextColor={colors.mutedText} style={styles.input} value={amount} />
      <TextInput accessibilityLabel={`Datum skutečné platby ${payment.name}`} onChangeText={setDate} placeholder="RRRR-MM-DD" placeholderTextColor={colors.mutedText} style={styles.input} value={date} />
      <Pressable accessibilityRole="button" disabled={busy || saving} onPress={() => void confirm()} style={[styles.primaryButton, (busy || saving) && styles.disabled]}><Text style={styles.primaryButtonText}>{saving ? 'Ukládám…' : 'Potvrdit skutečnou částku'}</Text></Pressable>
    </View> : <View style={styles.actions}>
      <Pressable accessibilityRole="button" disabled={busy || saving} onPress={() => setConfirming(true)} style={[styles.primarySmall, (busy || saving) && styles.disabled]}><Check color={colors.primaryForeground} size={17} /><Text style={styles.primarySmallText}>Zaplaceno</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy || saving} onPress={() => void skip()} style={[styles.secondarySmall, (busy || saving) && styles.disabled]}><SkipForward color={colors.secondaryText} size={16} /><Text style={styles.secondarySmallText}>{saving ? 'Ukládám…' : 'Přeskočit'}</Text></Pressable>
    </View>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>
}

export function RecurringPaymentsScreen({ payments, occurrences, today, currency, busy, onSave, onStop, onConfirm, onSkip }: {
  payments: RecurringPayment[]
  occurrences: RecurringOccurrence[]
  today: string
  currency: string
  busy: boolean
  onSave: (payment: RecurringPayment | null, input: RecurringPaymentInput) => Promise<void>
  onStop: (payment: RecurringPayment) => Promise<void>
  onConfirm: (id: string, dueDate: string, amount: number, date: string) => Promise<void>
  onSkip: (id: string, dueDate: string) => Promise<void>
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const { due, upcoming } = recurringOverview(payments, occurrences, today)
  const [editing, setEditing] = useState<RecurringPayment | null | undefined>(undefined)

  function confirmStop(payment: RecurringPayment) {
    Alert.alert('Zastavit pravidelnou platbu?', `${payment.name}. Dosavadní výdaje zůstanou zachované.`, [
      { text: 'Zrušit', style: 'cancel' },
      { text: 'Zastavit', style: 'destructive', onPress: () => { void Promise.resolve(onStop(payment)).then(() => setEditing(undefined)).catch(() => undefined) } },
    ])
  }

  return <View style={styles.screen}>
    <View style={styles.intro}>
      <View style={styles.headingIcon}><Repeat color={colors.accentText} size={19} /></View>
      <View style={styles.flex}><Text style={styles.title}>Pravidelné platby</Text><Text style={styles.supporting}>Nájem, energie, pojištění… Do výdajů se započítají, až je potvrdíte.</Text></View>
      <Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={styles.addButton}><Plus color={colors.accentText} size={17} /><Text style={styles.addText}>Přidat</Text></Pressable>
    </View>
    {due.length > 0 ? <View style={styles.section}>
      <Text style={styles.sectionTitle}>K potvrzení · {due.length}</Text>
      {due.map(({ payment, dueDate }) => <DueRow key={`${payment.id}|${dueDate}`} payment={payment} dueDate={dueDate} today={today} currency={currency} busy={busy} onConfirm={onConfirm} onSkip={onSkip} />)}
    </View> : null}
    {upcoming.length > 0 ? <View style={styles.section}>
      <Text style={styles.sectionTitle}>Brzy splatné</Text>
      {upcoming.map(({ payment, dueDate }) => <View key={payment.id} style={styles.upcomingRow}><CalendarClock color={colors.mutedText} size={18} /><Text numberOfLines={1} style={styles.upcomingName}>{payment.name}</Text><View style={styles.upcomingAmount}><Text style={styles.paymentAmount}>{money(payment.amount, currency)}</Text><Text style={styles.note}>{shortDate(dueDate)}</Text></View></View>)}
    </View> : null}
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Všechny platby · {payments.length}</Text>
      {payments.map((payment) => <Pressable key={payment.id} accessibilityRole="button" accessibilityLabel={`Upravit platbu ${payment.name}`} onPress={() => setEditing(payment)} style={styles.paymentRow}>
        <View style={styles.paymentIcon}><Repeat color={colors.accentText} size={17} /></View>
        <View style={styles.flex}><Text style={styles.paymentName}>{payment.name}</Text><Text style={styles.supporting}>{INTERVAL_LABELS[payment.intervalMonths]} · {payment.subcategory ?? payment.category}{payment.active ? '' : ' · zastavená'}</Text></View>
        <Text style={styles.paymentAmount}>{money(payment.amount, currency)}</Text>
      </Pressable>)}
      {payments.length === 0 ? <View style={styles.emptyCard}><Repeat color={colors.mutedText} size={22} /><Text style={styles.paymentName}>Zatím žádné pravidelné platby</Text><Text style={styles.supporting}>Přidejte platbu, která se opakuje. V den splatnosti vám ji připomeneme k potvrzení.</Text></View> : null}
    </View>
    {editing !== undefined ? <PaymentEditor payment={editing ?? null} today={today} currency={currency} busy={busy} onClose={() => setEditing(undefined)} onSave={async (input) => { await onSave(editing ?? null, input); setEditing(undefined) }} onStop={confirmStop} /> : null}
  </View>
}

function useStyles() {
  const { colors } = useMobileTheme()
  return StyleSheet.create({
    screen: { gap: 16 },
    intro: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headingIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.accentSubtle },
    flex: { flex: 1, minWidth: 0 },
    title: { color: colors.foreground, fontSize: 19, fontWeight: '800' },
    supporting: { color: colors.secondaryText, fontSize: 12, lineHeight: 17, marginTop: 3 },
    addButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.accentSubtle },
    addText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
    section: { gap: 8 },
    sectionTitle: { color: colors.mutedText, fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
    dueCard: { gap: 10, padding: 13, borderRadius: 16, backgroundColor: colors.muted },
    rowBetween: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    paymentName: { color: colors.foreground, fontSize: 14, fontWeight: '700' },
    paymentAmount: { color: colors.foreground, fontSize: 14, fontWeight: '800' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
    primarySmall: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.primary },
    primarySmallText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '700' },
    secondarySmall: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.card },
    secondarySmallText: { color: colors.secondaryText, fontSize: 13, fontWeight: '700' },
    confirmForm: { gap: 8, marginTop: 2 },
    upcomingRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11, borderRadius: 14, backgroundColor: colors.muted },
    upcomingName: { flex: 1, color: colors.foreground, fontSize: 13, fontWeight: '600' },
    upcomingAmount: { alignItems: 'flex-end' },
    note: { color: colors.mutedText, fontSize: 12, lineHeight: 17 },
    paymentRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
    paymentIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.accentSubtle },
    emptyCard: { alignItems: 'center', gap: 7, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.navyOverlay },
    modalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
    editor: { maxHeight: '94%', gap: 9, paddingHorizontal: 17, paddingTop: 18, paddingBottom: 26, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background },
    headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 3 },
    closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.muted },
    label: { color: colors.secondaryText, fontSize: 13, fontWeight: '600', marginTop: 2 },
    twoColumns: { flexDirection: 'row', gap: 10 },
    input: { minHeight: 46, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, backgroundColor: colors.card, color: colors.foreground, paddingHorizontal: 12, fontSize: 15 },
    choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.card },
    chipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
    chipText: { color: colors.secondaryText, fontSize: 12, fontWeight: '600' },
    chipTextActive: { color: colors.primaryForeground },
    primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 13, backgroundColor: colors.primary },
    primaryButtonText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '800' },
    stopButton: { alignItems: 'center', gap: 3, padding: 10, borderRadius: 12, backgroundColor: colors.destructiveSubtle },
    stopText: { color: colors.destructive, fontSize: 13, fontWeight: '700' },
    error: { color: colors.destructive, backgroundColor: colors.destructiveSubtle, padding: 10, borderRadius: 11, fontSize: 13 },
    disabled: { opacity: 0.55 },
  })
}
