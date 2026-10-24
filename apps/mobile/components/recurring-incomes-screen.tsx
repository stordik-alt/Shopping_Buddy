import { useState } from 'react'
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { CalendarClock, Check, Plus, TrendingUp, X } from 'lucide-react-native'
import { RECURRING_INCOME_INTERVALS, RECURRING_INCOME_INTERVAL_LABELS, recurringIncomeOverview, type RecurringIncome, type RecurringIncomeInput, type RecurringIncomeInterval, type RecurringIncomeOccurrence } from '../../../lib/recurring-incomes'
import { useMobileTheme } from '../lib/theme'

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount) } catch { return `${amount.toLocaleString('cs-CZ')} ${currency}` }
}
function shortDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' }) }
function parseAmount(value: string) { return Number(value.replace(/[\s ]/g, '').replace(',', '.')) }

function IncomeEditor({ income, today, currency, busy, onClose, onSave }: {
  income: RecurringIncome | null
  today: string
  currency: string
  busy: boolean
  onClose: () => void
  onSave: (input: RecurringIncomeInput) => Promise<void>
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [description, setDescription] = useState(income?.description ?? '')
  const [amount, setAmount] = useState(income ? String(income.expectedAmount).replace('.', ',') : '')
  const [intervalMonths, setIntervalMonths] = useState<RecurringIncomeInterval>(income?.intervalMonths ?? 1)
  const [startDate, setStartDate] = useState(income?.startDate ?? today)
  const [error, setError] = useState('')
  async function save() {
    const expectedAmount = parseAmount(amount)
    if (!description.trim()) return setError('Zadejte popis pravidelného příjmu.')
    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) return setError('Zadejte očekávanou částku větší než 0.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return setError('Zadejte datum ve formátu RRRR-MM-DD.')
    setError('')
    try { await onSave({ description, expectedAmount, intervalMonths, startDate }) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Pravidelný příjem se nepodařilo uložit.') }
  }
  return <Modal animationType="slide" onRequestClose={onClose} transparent visible>
    <View style={styles.backdrop}><ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled"><View style={styles.editor}>
      <View style={styles.headingRow}><View style={styles.flex}><Text style={styles.title}>{income ? 'Upravit pravidelný příjem' : 'Nový pravidelný příjem'}</Text><Text style={styles.supporting}>Odhad patří do plánu. Skutečnou částku potvrdíte při přijetí.</Text></View><Pressable accessibilityLabel="Zavřít formulář" onPress={onClose} style={styles.closeButton}><X color={colors.foreground} size={20} /></Pressable></View>
      <Text style={styles.label}>Popis příjmu</Text><TextInput accessibilityLabel="Popis pravidelného příjmu" onChangeText={setDescription} placeholder="Např. výplata" placeholderTextColor={colors.mutedText} style={styles.input} value={description} />
      <Text style={styles.label}>Očekávaná částka ({currency})</Text><TextInput accessibilityLabel="Očekávaná částka" keyboardType="decimal-pad" onChangeText={setAmount} placeholder="0,00" placeholderTextColor={colors.mutedText} style={styles.input} value={amount} />
      <Text style={styles.label}>Četnost</Text><View style={styles.choiceWrap}>{RECURRING_INCOME_INTERVALS.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: intervalMonths === value }} onPress={() => setIntervalMonths(value)} style={[styles.chip, intervalMonths === value && styles.chipActive]}><Text style={[styles.chipText, intervalMonths === value && styles.chipTextActive]}>{RECURRING_INCOME_INTERVAL_LABELS[value]}</Text></Pressable>)}</View>
      <Text style={styles.label}>První očekávané datum (RRRR-MM-DD)</Text><TextInput accessibilityLabel="První očekávané datum" onChangeText={setStartDate} placeholder="RRRR-MM-DD" placeholderTextColor={colors.mutedText} style={styles.input} value={startDate} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryButtonText}>{busy ? 'Ukládám…' : income ? 'Uložit změny' : 'Přidat pravidelný příjem'}</Text></Pressable>
    </View></ScrollView></View>
  </Modal>
}

function DueIncomeRow({ income, dueDate, today, currency, busy, onConfirm, onSkip }: {
  income: RecurringIncome
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
  const [amount, setAmount] = useState(String(income.expectedAmount).replace('.', ','))
  const [date, setDate] = useState(dueDate)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function confirm() {
    const parsed = parseAmount(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) return setError('Zadejte částku větší než 0.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return setError('Zadejte platné datum nejpozději dnes.')
    setSaving(true); setError('')
    try { await onConfirm(income.id, dueDate, parsed, date) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Příjem se nepodařilo potvrdit.') } finally { setSaving(false) }
  }
  async function skip() {
    setSaving(true); setError('')
    try { await onSkip(income.id, dueDate) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Termín se nepodařilo přeskočit.') } finally { setSaving(false) }
  }
  return <View style={styles.dueCard}>
    <View style={styles.rowBetween}><View style={styles.flex}><Text style={styles.rowTitle}>{income.description}</Text><Text style={styles.supporting}>Očekáváno {shortDate(dueDate)} · plán {money(income.expectedAmount, currency)}</Text></View></View>
    {confirming ? <View style={styles.formGap}><Text style={styles.label}>Kolik jste skutečně obdrželi?</Text><TextInput accessibilityLabel={`Skutečně přijatá částka ${income.description}`} keyboardType="decimal-pad" onChangeText={setAmount} placeholderTextColor={colors.mutedText} style={styles.input} value={amount} /><Text style={styles.label}>Datum přijetí (RRRR-MM-DD)</Text><TextInput accessibilityLabel={`Datum přijetí ${income.description}`} onChangeText={setDate} placeholder="RRRR-MM-DD" placeholderTextColor={colors.mutedText} style={styles.input} value={date} /><Pressable accessibilityRole="button" disabled={busy || saving} onPress={() => void confirm()} style={[styles.primaryButton, (busy || saving) && styles.disabled]}><Text style={styles.primaryButtonText}>{saving ? 'Ukládám…' : 'Potvrdit skutečnou částku'}</Text></Pressable></View> : <View style={styles.actions}><Pressable accessibilityRole="button" disabled={busy || saving} onPress={() => setConfirming(true)} style={[styles.primarySmall, (busy || saving) && styles.disabled]}><Check color={colors.primaryForeground} size={16} /><Text style={styles.primarySmallText}>Potvrdit částku</Text></Pressable><Pressable accessibilityRole="button" disabled={busy || saving} onPress={() => void skip()} style={[styles.secondarySmall, (busy || saving) && styles.disabled]}><Text style={styles.secondarySmallText}>{saving ? 'Ukládám…' : 'Přeskočit'}</Text></Pressable></View>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>
}

export function RecurringIncomesScreen({ payments, occurrences, today, currency, busy, onSave, onStop, onConfirm, onSkip }: {
  payments: RecurringIncome[]
  occurrences: RecurringIncomeOccurrence[]
  today: string
  currency: string
  busy: boolean
  onSave: (income: RecurringIncome | null, input: RecurringIncomeInput) => Promise<void>
  onStop: (income: RecurringIncome) => Promise<void>
  onConfirm: (id: string, dueDate: string, amount: number, date: string) => Promise<void>
  onSkip: (id: string, dueDate: string) => Promise<void>
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const { due, upcoming } = recurringIncomeOverview(payments, occurrences, today)
  const [editing, setEditing] = useState<RecurringIncome | null | undefined>(undefined)
  function stop(income: RecurringIncome) {
    Alert.alert('Zastavit pravidelný příjem?', `${income.description}. Už přijaté příjmy zůstanou v historii.`, [
      { text: 'Zrušit', style: 'cancel' },
      { text: 'Zastavit', style: 'destructive', onPress: () => { void onStop(income).then(() => setEditing(undefined)).catch(() => undefined) } },
    ])
  }
  return <View style={styles.section}>
    <View style={styles.intro}><View style={styles.headingIcon}><TrendingUp color={colors.accentText} size={19} /></View><View style={styles.flex}><Text style={styles.title}>Pravidelné příjmy</Text><Text style={styles.supporting}>Odhady se počítají do plánu, ne do skutečného zůstatku.</Text></View><Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={styles.addButton}><Plus color={colors.accentText} size={17} /><Text style={styles.addText}>Přidat</Text></Pressable></View>
    <View style={styles.section}><Text style={styles.sectionTitle}>K potvrzení · {due.length}</Text>{due.length ? due.map(({ income, dueDate }) => <DueIncomeRow key={`${income.id}|${dueDate}`} income={income} dueDate={dueDate} today={today} currency={currency} busy={busy} onConfirm={onConfirm} onSkip={onSkip} />) : <Text style={styles.supporting}>Žádný pravidelný příjem nečeká na potvrzení.</Text>}</View>
    <View style={styles.section}><Text style={styles.sectionTitle}>Brzy očekávané</Text>{upcoming.length ? upcoming.map(({ income, dueDate }) => <View key={income.id} style={styles.upcomingRow}><CalendarClock color={colors.mutedText} size={18} /><Text style={styles.flex}>{income.description} · {shortDate(dueDate)}</Text><Text style={styles.value}>{money(income.expectedAmount, currency)}</Text></View>) : <Text style={styles.supporting}>V příštích 31 dnech není naplánován další příjem.</Text>}</View>
    <View style={styles.section}><Text style={styles.sectionTitle}>Všechny pravidelné příjmy</Text>{payments.map((income) => <View key={income.id} style={styles.incomeRow}><Pressable accessibilityRole="button" onPress={() => setEditing(income)} style={styles.flex}><Text style={styles.rowTitle}>{income.description}</Text><Text style={styles.supporting}>{money(income.expectedAmount, currency)} · {RECURRING_INCOME_INTERVAL_LABELS[income.intervalMonths]} · první termín {shortDate(income.startDate)}{income.active ? '' : ' · zastaveno'}</Text></Pressable>{income.active ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => stop(income)} style={styles.stopAction}><Text style={styles.stopText}>Zastavit</Text></Pressable> : null}</View>)}{payments.length === 0 ? <Text style={styles.supporting}>Pravidelný příjem přidáte zde. Jednorázové příjmy zůstávají v části Příjmy.</Text> : null}</View>
    {editing !== undefined ? <IncomeEditor income={editing ?? null} today={today} currency={currency} busy={busy} onClose={() => setEditing(undefined)} onSave={async (input) => { await onSave(editing ?? null, input); setEditing(undefined) }} /> : null}
  </View>
}

function useStyles() {
  const { colors } = useMobileTheme()
  return StyleSheet.create({
    section: { gap: 8 }, flex: { flex: 1, minWidth: 0 },
    intro: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headingIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.accentSubtle },
    title: { color: colors.foreground, fontSize: 17, fontWeight: '800' }, supporting: { color: colors.secondaryText, fontSize: 12, lineHeight: 17, marginTop: 3 },
    addButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.accentSubtle }, addText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
    sectionTitle: { color: colors.mutedText, fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
    dueCard: { gap: 9, padding: 12, borderRadius: 15, backgroundColor: colors.muted }, rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 8 }, rowTitle: { color: colors.foreground, fontSize: 14, fontWeight: '700' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, primarySmall: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 11, borderRadius: 11, backgroundColor: colors.primary }, primarySmallText: { color: colors.primaryForeground, fontSize: 12, fontWeight: '700' }, secondarySmall: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 11, backgroundColor: colors.card }, secondarySmallText: { color: colors.secondaryText, fontSize: 12, fontWeight: '700' },
    formGap: { gap: 7 }, upcomingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 13, backgroundColor: colors.muted }, value: { color: colors.foreground, fontSize: 13, fontWeight: '700' }, incomeRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border }, stopAction: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 9 }, stopText: { color: colors.destructive, fontSize: 12, fontWeight: '700' },
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.navyOverlay }, modalScroll: { flexGrow: 1, justifyContent: 'flex-end' }, editor: { maxHeight: '92%', gap: 9, paddingHorizontal: 17, paddingTop: 18, paddingBottom: 26, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background }, headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.muted }, label: { color: colors.secondaryText, fontSize: 13, fontWeight: '600', marginTop: 2 }, input: { minHeight: 46, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, backgroundColor: colors.card, color: colors.foreground, paddingHorizontal: 12, fontSize: 15 }, choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.card }, chipActive: { borderColor: colors.primary, backgroundColor: colors.primary }, chipText: { color: colors.secondaryText, fontSize: 12, fontWeight: '600' }, chipTextActive: { color: colors.primaryForeground }, primaryButton: { minHeight: 47, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderRadius: 13, backgroundColor: colors.primary }, primaryButtonText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '800' }, error: { color: colors.destructive, backgroundColor: colors.destructiveSubtle, padding: 10, borderRadius: 11, fontSize: 13 }, disabled: { opacity: 0.55 },
  })
}
