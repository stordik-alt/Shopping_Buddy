import { useMemo, useState } from 'react'
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { CalendarClock, ChevronDown, ChevronUp, History, Settings2, X } from 'lucide-react-native'
import { evaluatePeriod, planClosing, type PocketAmount } from '../../../lib/budget-closing'
import { projectOutlook } from '../../../lib/budget-outlook'
import { pendingCommitments } from '../../../lib/budget-forecast'
import { CALENDAR_PERIOD, MAX_CUSTOM_PERIOD_DAYS, MAX_PERIOD_START_DAY, MIN_CUSTOM_PERIOD_DAYS, periodConfigError, periodConfigKey, periodEndFor, periodStartFor, type PeriodConfig } from '../../../lib/budget-period'
import { dayNumber, isoFromDayNumber } from '../../../lib/budget-period'
import { periodLabel } from '../../../lib/format'
import type { BudgetOutlook, ClosingPreview, Pocket } from '../../../lib/types'
import type { PeriodHistoryRow } from '../../../lib/budget-history'
import type { RecurringOccurrence, RecurringPayment } from '../../../lib/recurring-payments'
import type { MobileBudgetLedger, MobilePeriodSettings } from '../lib/shopping-list-api'
import { useMobileTheme } from '../lib/theme'

function money(amount: number, currency: string) { try { return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount) } catch { return `${amount.toLocaleString('cs-CZ')} ${currency}` } }
function parseAmount(value: string) { const text = value.replace(/[\s ]/g, '').replace(',', '.'); return text === '' ? 0 : Number(text) }
function signed(amount: number, currency: string) { return amount > 0 ? `+${money(amount, currency)}` : amount < 0 ? `−${money(-amount, currency)}` : money(0, currency) }

function PeriodSettingsEditor({ settings, busy, onSave }: { settings: MobilePeriodSettings; busy: boolean; onSave: (period: PeriodConfig) => Promise<void> }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [period, setPeriod] = useState<PeriodConfig>(settings.period)
  const [error, setError] = useState('')
  const invalid = periodConfigError(period)
  const changed = periodConfigKey(period) !== periodConfigKey(settings.period)
  const label = !invalid ? periodLabel(periodStartFor(period, settings.today), periodEndFor(period, periodStartFor(period, settings.today))) : ''
  async function save() {
    if (invalid) return setError(invalid)
    setError('')
    try { await onSave(period) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Období se nepodařilo uložit.') }
  }
  return <View style={styles.card}>
    <View style={styles.sectionHead}><Settings2 color={colors.accentText} size={18} /><Text style={styles.sectionTitle}>Nastavení období</Text></View>
    <Text style={styles.supporting}>Rozpočet může sledovat kalendářní měsíc, výplatní den nebo vlastní délku období.</Text>
    <View style={styles.chips}>{([['calendar', 'Kalendářní měsíc'], ['payday', 'Od výplaty'], ['custom', 'Vlastní']] as const).map(([kind, label]) => <Pressable key={kind} accessibilityRole="radio" accessibilityState={{ checked: period.type === kind }} onPress={() => setPeriod(kind === 'calendar' ? CALENDAR_PERIOD : kind === 'payday' ? { type: 'payday', startDay: 15 } : { type: 'custom', anchor: settings.today, lengthDays: 14 })} style={[styles.chip, period.type === kind && styles.chipActive]}><Text style={[styles.chipText, period.type === kind && styles.chipTextActive]}>{label}</Text></Pressable>)}</View>
    {period.type === 'payday' ? <><Text style={styles.label}>Začátek období</Text><View style={styles.chips}>{Array.from({ length: MAX_PERIOD_START_DAY - 1 }, (_, index) => index + 2).map((day) => <Pressable key={day} accessibilityRole="radio" accessibilityState={{ checked: period.startDay === day }} onPress={() => setPeriod({ type: 'payday', startDay: day })} style={[styles.chip, period.startDay === day && styles.chipActive]}><Text style={[styles.chipText, period.startDay === day && styles.chipTextActive]}>{day}.</Text></Pressable>)}</View></> : null}
    {period.type === 'custom' ? <View style={styles.twoColumns}><View style={styles.flex}><Text style={styles.label}>První den</Text><TextInput accessibilityLabel="První den vlastního období" onChangeText={(anchor) => setPeriod((current) => current.type === 'custom' ? { ...current, anchor } : current)} placeholder="RRRR-MM-DD" placeholderTextColor={colors.mutedText} style={styles.input} value={period.anchor} /></View><View style={styles.flex}><Text style={styles.label}>Délka · {MIN_CUSTOM_PERIOD_DAYS} až {MAX_CUSTOM_PERIOD_DAYS} dní</Text><TextInput accessibilityLabel="Délka vlastního období ve dnech" keyboardType="number-pad" onChangeText={(value) => setPeriod((current) => current.type === 'custom' ? { ...current, lengthDays: Number(value) } : current)} style={styles.input} value={String(period.lengthDays)} /></View></View> : null}
    {changed && !invalid ? <Text style={styles.supporting}>Dnes spadá do období {label}. Uložení přepočítá přehledy podle nového nastavení.</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : invalid ? <Text style={styles.error}>{invalid}</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy || !changed || Boolean(invalid)} onPress={() => void save()} style={[styles.primaryButton, (busy || !changed || Boolean(invalid)) && styles.disabled]}><Text style={styles.primaryButtonText}>{busy ? 'Ukládám…' : 'Uložit období'}</Text></Pressable>
  </View>
}

function ClosingEditor({ preview, pockets, currency, busy, onClose, onConfirm }: { preview: ClosingPreview; pockets: Pocket[]; currency: string; busy: boolean; onClose: () => void; onConfirm: (choice: { periodStart: string; deposits: PocketAmount[]; withdrawals: PocketAmount[]; carryOn: number }) => Promise<void> }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [carry, setCarry] = useState('')
  const [error, setError] = useState('')
  const verdict = evaluatePeriod(preview.result)
  const choice = useMemo(() => {
    const rows = pockets.map((pocket) => ({ pocketId: pocket.id, amount: parseAmount(amounts[pocket.id] ?? '') })).filter((row) => row.amount !== 0)
    return verdict.kind === 'deficit' ? { deposits: [], withdrawals: rows, carryOn: 0 } : { deposits: rows, withdrawals: [], carryOn: parseAmount(carry) }
  }, [amounts, carry, pockets, verdict.kind])
  const result = planClosing(preview.result, choice, new Map(pockets.map((pocket) => [pocket.id, pocket.balance])))
  async function submit() {
    if ('error' in result) return setError(result.error)
    setError('')
    try { await onConfirm({ periodStart: preview.periodStart, ...choice }); onClose() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Období se nepodařilo uzavřít.') }
  }
  return <Modal animationType="slide" onRequestClose={onClose} transparent visible><View style={styles.backdrop}><ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled"><View style={styles.modalCard}>
    <View style={styles.headingRow}><View style={styles.flex}><Text style={styles.title}>Uzavřít období</Text><Text style={styles.supporting}>{periodLabel(preview.periodStart, isoFromDayNumber(dayNumber(preview.periodEnd) - 1))}</Text></View><Pressable accessibilityLabel="Zavřít uzavření období" onPress={onClose} style={styles.closeButton}><X color={colors.foreground} size={20} /></Pressable></View>
    <Text style={styles.closingLead}>{verdict.kind === 'surplus' ? `Zůstalo ${money(verdict.amount, currency)}. Rozdělte přebytek.` : verdict.kind === 'deficit' ? `Schodek ${money(verdict.amount, currency)}. Zvolte Kapsy, ze kterých ho pokryjete.` : 'Období skončilo vyrovnaně.'}</Text>
    <View style={styles.statsGrid}><Stat label="Příjmy" value={money(preview.received, currency)} /><Stat label="Převod dovnitř" value={money(preview.carryIn, currency)} /><Stat label="Výdaje" value={money(preview.expenses, currency)} /><Stat label="Převody do Kapes" value={money(preview.transfers, currency)} /></View>
    {verdict.kind !== 'even' ? <>
      <Text style={styles.sectionTitle}>{verdict.kind === 'surplus' ? 'Rozdělení přebytku' : 'Pokrytí schodku'}</Text>
      {pockets.map((pocket) => <View key={pocket.id} style={styles.closePocketRow}><View style={styles.flex}><Text style={styles.rowTitle}>{pocket.name}</Text><Text style={styles.supporting}>V Kapse {money(pocket.balance, currency)}</Text></View><TextInput accessibilityLabel={`${verdict.kind === 'surplus' ? 'Uložit do' : 'Vzít z'} Kapsy ${pocket.name}`} keyboardType="decimal-pad" onChangeText={(value) => setAmounts((current) => ({ ...current, [pocket.id]: value }))} placeholder="0" placeholderTextColor={colors.mutedText} style={styles.amountInput} value={amounts[pocket.id] ?? ''} /></View>)}
      {verdict.kind === 'surplus' ? <View style={styles.closePocketRow}><Text style={styles.rowTitle}>Převést do dalšího období</Text><TextInput accessibilityLabel="Převod do dalšího období" keyboardType="decimal-pad" onChangeText={setCarry} placeholder="0" placeholderTextColor={colors.mutedText} style={styles.amountInput} value={carry} /></View> : null}
    </> : null}
    {'error' in result ? <Text style={styles.error}>{result.error}</Text> : <Text style={styles.supporting}>Další období začne s převodem {signed(result.plan.carry, currency)}.</Text>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy || 'error' in result} onPress={() => void submit()} style={[styles.primaryButton, (busy || 'error' in result) && styles.disabled]}><Text style={styles.primaryButtonText}>{busy ? 'Uzavírám…' : 'Uzavřít období'}</Text></Pressable>
  </View></ScrollView></View></Modal>
}

function Stat({ label, value }: { label: string; value: string }) { const styles = useStyles(); return <View style={styles.stat}><Text style={styles.supporting}>{label}</Text><Text style={styles.rowTitle}>{value}</Text></View> }

export function BudgetAdvancedScreen({ settings, outlook, history, ledger, payments, occurrences, currency, canManage, busy, onSavePeriod, onSaveCarry, onClosePeriod, onReopenPeriod, onOpenExpenses }: {
  settings: MobilePeriodSettings | null
  outlook: BudgetOutlook | null
  history: PeriodHistoryRow[] | null
  ledger: MobileBudgetLedger | null
  payments: RecurringPayment[]
  occurrences: RecurringOccurrence[]
  currency: string
  canManage: boolean
  busy: boolean
  onSavePeriod: (period: PeriodConfig) => Promise<void>
  onSaveCarry: (period: string, amount: number | null) => Promise<void>
  onClosePeriod: (input: { periodStart: string; deposits: PocketAmount[]; withdrawals: PocketAmount[]; carryOn: number }) => Promise<void>
  onReopenPeriod: (period: string) => Promise<void>
  onOpenExpenses: (period: string) => void
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [outlookOpen, setOutlookOpen] = useState(false)
  const [closingOpen, setClosingOpen] = useState(false)
  const [carryDrafts, setCarryDrafts] = useState<Record<string, string>>({})
  const projection = useMemo(() => {
    if (!outlook || !settings) return []
    return projectOutlook({ actualNow: outlook.actualNow, spentNow: outlook.spentNow, historicalSpending: outlook.historicalSpending, periods: outlook.periods.map((entry) => ({ ...entry, commitments: pendingCommitments(payments, occurrences, entry.periodStart, periodEndFor(settings.period, entry.periodStart)).reduce((sum, item) => sum + item.amount, 0) })) })
  }, [outlook, settings, payments, occurrences])
  const ahead = projection.slice(1)
  function reopen(periodStart: string) {
    Alert.alert('Znovu otevřít období?', 'Převody do Kapes vytvořené při uzavření se vrátí zpět.', [{ text: 'Zrušit', style: 'cancel' }, { text: 'Znovu otevřít', onPress: () => { void onReopenPeriod(periodStart).catch(() => undefined) } }])
  }

  return <View style={styles.screen}>
    {ledger?.toClose ? <View style={styles.card}><Text style={styles.sectionTitle}>Minulé období skončilo</Text><Text style={styles.supporting}>{periodLabel(ledger.toClose.periodStart, ledger.toClose.periodEnd)} · {ledger.toClose.result >= 0 ? `zbylo ${money(ledger.toClose.result, currency)}` : `schodek ${money(-ledger.toClose.result, currency)}`}</Text>{canManage ? <Pressable accessibilityRole="button" onPress={() => setClosingOpen(true)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Uzavřít období</Text></Pressable> : <Text style={styles.supporting}>Období uzavře správce domácnosti.</Text>}</View> : null}
    {ledger?.previousClosedStart && canManage ? <View style={styles.card}><Text style={styles.sectionTitle}>Předchozí období je uzavřené</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => reopen(ledger.previousClosedStart!)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Znovu otevřít období</Text></Pressable></View> : null}
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: outlookOpen }} onPress={() => setOutlookOpen((value) => !value)} style={styles.sectionHead}><CalendarClock color={colors.accentText} size={18} /><Text style={styles.sectionTitle}>Výhled dalších období</Text>{outlookOpen ? <ChevronUp color={colors.mutedText} size={18} /> : <ChevronDown color={colors.mutedText} size={18} />}</Pressable>
      {outlookOpen ? (outlook ? <>
        {outlook.historicalSpendingByCategory?.length ? <View style={styles.historyInset}><Text style={styles.rowTitle}>Výdaje podle kategorií · průměr za 3 období</Text>{outlook.historicalSpendingByCategory.slice(0, 6).map((row) => <View key={row.category} style={styles.historyRow}><Text style={styles.supporting}>{row.category}</Text><Text style={styles.rowTitle}>{money(row.average, currency)}</Text></View>)}</View> : null}
        {ahead.slice(0, 5).map((row) => {
          const dateLabel = periodLabel(row.periodStart, periodEndFor(settings?.period ?? CALENDAR_PERIOD, row.periodStart))
          const value = carryDrafts[row.periodStart] ?? (row.plannedCarry == null ? '' : String(row.plannedCarry).replace('.', ','))
          return <View key={row.periodStart} style={styles.outlookPeriod}>
            <View style={styles.rowBetween}><Text style={styles.rowTitle}>{dateLabel}</Text><Text style={[styles.rowTitle, row.predicted != null && row.predicted < 0 && styles.over]}>{row.predicted == null ? 'Příjem není naplánován' : row.predicted < 0 ? `Chybět ${money(-row.predicted, currency)}` : `Predikce ${money(row.predicted, currency)}`}</Text></View>
            <Text style={styles.supporting}>Začne {signed(row.opening, currency)} · příjmy {money(row.income, currency)} · výdaje {money(row.spending, currency)}</Text>
            <View style={styles.carryRow}><Text style={styles.supporting}>Plánovaný převod dál</Text><TextInput accessibilityLabel={`Plánovaný převod pro období ${row.periodStart}`} editable={canManage && row.periodStart >= (settings?.currentPeriodStart ?? row.periodStart)} keyboardType="decimal-pad" onChangeText={(next) => setCarryDrafts((current) => ({ ...current, [row.periodStart]: next }))} placeholder="bez plánu" placeholderTextColor={colors.mutedText} style={styles.amountInput} value={value} /></View>
            {canManage ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => { const amount = value.trim() ? Number(value.replace(/[\s ]/g, '').replace(',', '.')) : null; if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return; void onSaveCarry(row.periodStart, amount).catch(() => undefined) }} style={styles.inlineButton}><Text style={styles.inlineText}>Uložit plán převodu</Text></Pressable> : null}
          </View>
        })}
      </> : <Text style={styles.supporting}>Načítám výhled…</Text>) : <Text style={styles.supporting}>Odhad příjmů, výdajů, závazků a převodů na příštích 12 období.</Text>}
    </View>
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: historyOpen }} onPress={() => setHistoryOpen((value) => !value)} style={styles.sectionHead}><History color={colors.accentText} size={18} /><Text style={styles.sectionTitle}>Historie období</Text>{historyOpen ? <ChevronUp color={colors.mutedText} size={18} /> : <ChevronDown color={colors.mutedText} size={18} />}</Pressable>
      {historyOpen ? history ? history.length ? history.map((row) => <View key={row.periodStart} style={styles.historyEntry}><View style={styles.rowBetween}><Text style={styles.rowTitle}>{settings ? periodLabel(row.periodStart, isoFromDayNumber(dayNumber(row.periodEnd) - 1)) : row.periodStart}</Text><Text style={[styles.rowTitle, row.result < 0 && styles.over]}>{row.result < 0 ? `Schodek ${money(-row.result, currency)}` : `Výsledek ${money(row.result, currency)}`}</Text></View><Text style={styles.supporting}>Rozpočet {money(row.budget, currency)} · příjmy {money(row.received, currency)} · výdaje {money(row.expenses, currency)} · {row.closed ? 'uzavřeno' : 'neuzavřeno'}</Text>{row.saved ? <Text style={styles.supporting}>Uloženo do Kapes {money(row.saved, currency)}</Text> : null}<Pressable accessibilityRole="button" onPress={() => onOpenExpenses(row.periodStart)} style={styles.inlineButton}><Text style={styles.inlineText}>Zobrazit výdaje</Text></Pressable></View>) : <Text style={styles.supporting}>Zatím tu nejsou žádná minulá období.</Text> : <Text style={styles.supporting}>Načítám historii…</Text> : <Text style={styles.supporting}>Skutečné výsledky předchozích období.</Text>}
    </View>
    {settings && settings.canEdit && canManage ? <PeriodSettingsEditor key={periodConfigKey(settings.period)} settings={settings} busy={busy} onSave={onSavePeriod} /> : null}
    {closingOpen && ledger?.toClose ? <ClosingEditor preview={ledger.toClose} pockets={ledger.pockets} currency={currency} busy={busy} onClose={() => setClosingOpen(false)} onConfirm={onClosePeriod} /> : null}
  </View>
}

function useStyles() {
  const { colors } = useMobileTheme()
  return StyleSheet.create({
    screen: { gap: 10 }, card: { gap: 9, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }, sectionHead: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 8 }, sectionTitle: { flex: 1, color: colors.foreground, fontSize: 14, fontWeight: '800' }, supporting: { color: colors.secondaryText, fontSize: 12, lineHeight: 17, marginTop: 2 }, label: { color: colors.secondaryText, fontSize: 12, fontWeight: '700' }, rowTitle: { color: colors.foreground, fontSize: 13, fontWeight: '700' }, rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, over: { color: colors.destructive },
    primaryButton: { minHeight: 43, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.primary }, primaryButtonText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '800' }, secondaryButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 11, backgroundColor: colors.accentSubtle }, secondaryText: { color: colors.accentText, fontSize: 12, fontWeight: '700' }, disabled: { opacity: 0.5 }, inlineButton: { minHeight: 36, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 8 }, inlineText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { minHeight: 35, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }, chipActive: { borderColor: colors.primary, backgroundColor: colors.primary }, chipText: { color: colors.secondaryText, fontSize: 11, fontWeight: '600' }, chipTextActive: { color: colors.primaryForeground }, twoColumns: { flexDirection: 'row', gap: 8 }, flex: { flex: 1, minWidth: 0 }, input: { minHeight: 43, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 11, backgroundColor: colors.elevated, color: colors.foreground, paddingHorizontal: 10, fontSize: 13 }, amountInput: { width: 112, minHeight: 40, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 10, backgroundColor: colors.elevated, color: colors.foreground, paddingHorizontal: 9, textAlign: 'right', fontSize: 13 }, error: { color: colors.destructive, backgroundColor: colors.destructiveSubtle, padding: 9, borderRadius: 10, fontSize: 12 },
    outlookPeriod: { gap: 5, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.border }, carryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, historyInset: { gap: 6, padding: 10, borderRadius: 12, backgroundColor: colors.muted }, historyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, historyEntry: { gap: 4, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.navyOverlay }, modalScroll: { flexGrow: 1, justifyContent: 'flex-end' }, modalCard: { maxHeight: '94%', gap: 10, padding: 16, paddingBottom: 25, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background }, headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.muted }, title: { color: colors.foreground, fontSize: 18, fontWeight: '800' }, closingLead: { color: colors.foreground, fontSize: 15, fontWeight: '700' }, statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, stat: { flexGrow: 1, minWidth: '46%', gap: 3, padding: 9, borderRadius: 11, backgroundColor: colors.muted }, closePocketRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  })
}
