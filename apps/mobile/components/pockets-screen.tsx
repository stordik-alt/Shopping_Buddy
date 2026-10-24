import { useState } from 'react'
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { Car, Gift, GraduationCap, Heart, House, PiggyBank, Plane, Shield, X } from 'lucide-react-native'
import { POCKET_ICONS, type PocketInput } from '../../../lib/pocket-input'
import { maxDeposit, pocketProgress } from '../../../lib/budget-closing'
import type { Pocket } from '../../../lib/types'
import { useMobileTheme } from '../lib/theme'

const ICONS = { 'piggy-bank': PiggyBank, shield: Shield, car: Car, home: House, plane: Plane, gift: Gift, graduation: GraduationCap, heart: Heart } as const
const LABELS = { 'piggy-bank': 'Prasátko', shield: 'Štít', car: 'Auto', home: 'Dům', plane: 'Letadlo', gift: 'Dárek', graduation: 'Škola', heart: 'Srdce' } as const
function money(amount: number, currency: string) { try { return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount) } catch { return `${amount.toLocaleString('cs-CZ')} ${currency}` } }
function parseAmount(value: string): number | null { const cleaned = value.replace(/[\s ]/g, '').replace(',', '.'); return cleaned === '' ? null : Number(cleaned) }
function showAmount(value: number | null) { return value == null ? '' : String(value).replace('.', ',') }

function PocketEditor({ pocket, currency, busy, onClose, onSave, onArchive }: {
  pocket: Pocket | null
  currency: string
  busy: boolean
  onClose: () => void
  onSave: (input: PocketInput) => Promise<void>
  onArchive: () => void
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [name, setName] = useState(pocket?.name ?? '')
  const [icon, setIcon] = useState(pocket?.icon ?? 'piggy-bank')
  const [targetAmount, setTargetAmount] = useState(showAmount(pocket?.targetAmount ?? null))
  const [targetDate, setTargetDate] = useState(pocket?.targetDate ?? '')
  const [openingAmount, setOpeningAmount] = useState(showAmount(pocket?.openingAmount ?? 0))
  const [plannedContribution, setPlannedContribution] = useState(showAmount(pocket?.plannedContribution ?? null))
  const [isReserve, setIsReserve] = useState(pocket?.isReserve ?? false)
  const [error, setError] = useState('')
  async function save() {
    const target = parseAmount(targetAmount), opening = parseAmount(openingAmount), contribution = parseAmount(plannedContribution)
    if ([target, opening, contribution].some((value) => value !== null && !Number.isFinite(value))) return setError('Částky zadejte číslem.')
    setError('')
    try { await onSave({ name, icon, targetAmount: target, targetDate: targetDate || null, openingAmount: opening ?? 0, plannedContribution: contribution, isReserve }) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Kapsu se nepodařilo uložit.') }
  }
  return <Modal animationType="slide" onRequestClose={onClose} transparent visible>
    <View style={styles.backdrop}><ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled"><View style={styles.editor}>
      <View style={styles.headingRow}><View style={styles.flex}><Text style={styles.title}>{pocket ? 'Upravit Kapsu' : 'Nová Kapsa'}</Text><Text style={styles.supporting}>Kapsa oddělí peníze na konkrétní účel.</Text></View><Pressable accessibilityLabel="Zavřít formulář" onPress={onClose} style={styles.closeButton}><X color={colors.foreground} size={20} /></Pressable></View>
      <Text style={styles.label}>Název</Text><TextInput accessibilityLabel="Název Kapsy" maxLength={60} onChangeText={setName} placeholder="Např. Auto nebo dovolená" placeholderTextColor={colors.mutedText} style={styles.input} value={name} />
      <Text style={styles.label}>Ikona</Text><View style={styles.iconGrid}>{POCKET_ICONS.map((key) => { const Icon = ICONS[key]; const selected = icon === key; return <Pressable key={key} accessibilityRole="radio" accessibilityLabel={LABELS[key]} accessibilityState={{ checked: selected }} onPress={() => setIcon(key)} style={[styles.iconChoice, selected && styles.iconChoiceActive]}><Icon color={selected ? colors.accentText : colors.secondaryText} size={21} /></Pressable> })}</View>
      <View style={styles.twoColumns}><View style={styles.flex}><Text style={styles.label}>Cílová částka ({currency})</Text><TextInput accessibilityLabel="Cílová částka" keyboardType="decimal-pad" onChangeText={setTargetAmount} placeholder="nepovinné" placeholderTextColor={colors.mutedText} style={styles.input} value={targetAmount} /></View><View style={styles.flex}><Text style={styles.label}>Termín cíle</Text><TextInput accessibilityLabel="Termín cíle" onChangeText={setTargetDate} placeholder="RRRR-MM-DD" placeholderTextColor={colors.mutedText} style={styles.input} value={targetDate} /></View></View>
      <View style={styles.twoColumns}><View style={styles.flex}><Text style={styles.label}>Počáteční částka</Text><TextInput accessibilityLabel="Počáteční částka" keyboardType="decimal-pad" onChangeText={setOpeningAmount} placeholder="0" placeholderTextColor={colors.mutedText} style={styles.input} value={openingAmount} /></View><View style={styles.flex}><Text style={styles.label}>Plánovaný příspěvek za období</Text><TextInput accessibilityLabel="Plánovaný příspěvek" keyboardType="decimal-pad" onChangeText={setPlannedContribution} placeholder="nepovinné" placeholderTextColor={colors.mutedText} style={styles.input} value={plannedContribution} /></View></View>
      <View style={styles.switchRow}><View style={styles.flex}><Text style={styles.rowTitle}>Finanční rezerva</Text><Text style={styles.supporting}>V návrzích se použije při schodku a doplní při přebytku.</Text></View><Switch accessibilityLabel="Finanční rezerva" value={isReserve} onValueChange={setIsReserve} trackColor={{ false: colors.border, true: colors.accent }} thumbColor={colors.card} /></View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryButtonText}>{busy ? 'Ukládám…' : pocket ? 'Uložit změny' : 'Přidat Kapsu'}</Text></Pressable>
      {pocket ? <Pressable accessibilityRole="button" disabled={busy} onPress={onArchive} style={styles.archiveButton}><Text style={styles.archiveText}>Odložit Kapsu</Text><Text style={styles.supporting}>Lze jen prázdnou Kapsu.</Text></Pressable> : null}
    </View></ScrollView></View>
  </Modal>
}

function TransferModal({ pocket, direction, max, currency, busy, onClose, onSubmit }: {
  pocket: Pocket
  direction: 'deposit' | 'withdraw'
  max: number
  currency: string
  busy: boolean
  onClose: () => void
  onSubmit: (amount: number) => Promise<void>
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  async function submit() {
    const value = parseAmount(amount)
    if (value == null || !Number.isFinite(value) || value <= 0) return setError('Zadejte částku větší než 0.')
    if (value > max) return setError(`Maximální částka je ${money(max, currency)}.`)
    setError('')
    try { await onSubmit(value) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Převod se nepodařilo uložit.') }
  }
  return <Modal animationType="slide" onRequestClose={onClose} transparent visible><View style={styles.backdrop}><View style={styles.transferSheet}>
    <View style={styles.headingRow}><View style={styles.flex}><Text style={styles.title}>{direction === 'deposit' ? 'Uložit do Kapsy' : 'Vzít z Kapsy'}</Text><Text style={styles.supporting}>{pocket.name} · k dispozici {money(max, currency)}</Text></View><Pressable accessibilityLabel="Zavřít převod" onPress={onClose} style={styles.closeButton}><X color={colors.foreground} size={20} /></Pressable></View>
    <TextInput accessibilityLabel="Částka převodu" keyboardType="decimal-pad" onChangeText={setAmount} placeholder={`Max. ${money(max, currency)}`} placeholderTextColor={colors.mutedText} style={styles.input} value={amount} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryButtonText}>{busy ? 'Ukládám…' : direction === 'deposit' ? 'Uložit peníze' : 'Vrátit do rozpočtu'}</Text></Pressable>
  </View></View></Modal>
}

export function PocketsScreen({ pockets, availableToSave, currency, busy, onSave, onTransfer, onArchive }: {
  pockets: Pocket[]
  availableToSave: number
  currency: string
  busy: boolean
  onSave: (pocket: Pocket | null, input: PocketInput) => Promise<void>
  onTransfer: (pocket: Pocket, direction: 'deposit' | 'withdraw', amount: number) => Promise<void>
  onArchive: (pocket: Pocket) => Promise<void>
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [editing, setEditing] = useState<Pocket | null | undefined>(undefined)
  const [transfer, setTransfer] = useState<{ pocket: Pocket; direction: 'deposit' | 'withdraw' } | null>(null)
  function archive(pocket: Pocket) {
    Alert.alert('Odložit Kapsu?', `${pocket.name}. Odložit lze jen prázdnou Kapsu.`, [
      { text: 'Zrušit', style: 'cancel' },
      { text: 'Odložit', style: 'destructive', onPress: () => { void onArchive(pocket).then(() => setEditing(undefined)).catch(() => undefined) } },
    ])
  }
  return <View style={styles.screen}>
    <View style={styles.intro}><View style={styles.headingIcon}><PiggyBank color={colors.accentText} size={19} /></View><View style={styles.flex}><Text style={styles.title}>Kapsy</Text><Text style={styles.supporting}>Peníze odložené na cíle a rezervu.</Text></View><Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={styles.addButton}><Text style={styles.addText}>＋ Přidat</Text></Pressable></View>
    <View style={styles.availableCard}><Text style={styles.supporting}>Volné v rozpočtu k uložení</Text><Text style={styles.value}>{money(maxDeposit(availableToSave), currency)}</Text></View>
    {pockets.map((pocket) => {
      const Icon = ICONS[pocket.icon as keyof typeof ICONS] ?? PiggyBank
      const progress = pocketProgress(pocket.balance, pocket.targetAmount)
      return <View key={pocket.id} style={styles.pocketCard}>
        <View style={styles.rowBetween}><View style={styles.pocketIcon}><Icon color={colors.accentText} size={20} /></View><Pressable accessibilityRole="button" accessibilityLabel={`Upravit Kapsu ${pocket.name}`} onPress={() => setEditing(pocket)} style={styles.flex}><Text style={styles.rowTitle}>{pocket.name}{pocket.isReserve ? ' · Rezerva' : ''}</Text>{pocket.targetAmount != null && pocket.targetDate ? <Text style={styles.supporting}>Cíl {money(pocket.targetAmount, currency)} do {pocket.targetDate}</Text> : null}</Pressable><Text style={styles.value}>{money(pocket.balance, currency)}</Text></View>
        {progress != null ? <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} accessibilityLabel={`Splněno z cíle Kapsy ${pocket.name}`} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View> : null}
        {pocket.plannedContribution != null || pocket.recommended != null ? <Text style={styles.supporting}>{pocket.plannedContribution != null ? `Plánujete ukládat ${money(pocket.plannedContribution, currency)} za období. ` : ''}{pocket.recommended != null && pocket.recommended > 0 ? `K cíli doporučujeme ${money(pocket.recommended, currency)} za období.` : pocket.recommended === 0 ? 'Cíl je splněný.' : ''}</Text> : null}
        <View style={styles.actions}><Pressable accessibilityRole="button" disabled={availableToSave <= 0 || busy} onPress={() => setTransfer({ pocket, direction: 'deposit' })} style={[styles.secondaryButton, (availableToSave <= 0 || busy) && styles.disabled]}><Text style={styles.secondaryText}>Uložit</Text></Pressable><Pressable accessibilityRole="button" disabled={pocket.balance <= 0 || busy} onPress={() => setTransfer({ pocket, direction: 'withdraw' })} style={[styles.secondaryButton, (pocket.balance <= 0 || busy) && styles.disabled]}><Text style={styles.secondaryText}>Vrátit</Text></Pressable></View>
      </View>
    })}
    {pockets.length === 0 ? <View style={styles.emptyCard}><PiggyBank color={colors.mutedText} size={24} /><Text style={styles.rowTitle}>Zatím nemáte žádnou Kapsu</Text><Text style={styles.supporting}>Založte si třeba rezervu, Kapsu na auto nebo dovolenou.</Text><Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Přidat Kapsu</Text></Pressable></View> : null}
    {editing !== undefined ? <PocketEditor pocket={editing ?? null} currency={currency} busy={busy} onClose={() => setEditing(undefined)} onSave={async (input) => { await onSave(editing ?? null, input); setEditing(undefined) }} onArchive={() => editing && archive(editing)} /> : null}
    {transfer ? <TransferModal pocket={transfer.pocket} direction={transfer.direction} max={transfer.direction === 'deposit' ? maxDeposit(availableToSave) : transfer.pocket.balance} currency={currency} busy={busy} onClose={() => setTransfer(null)} onSubmit={async (amount) => { await onTransfer(transfer.pocket, transfer.direction, amount); setTransfer(null) }} /> : null}
  </View>
}

function useStyles() {
  const { colors } = useMobileTheme()
  return StyleSheet.create({
    screen: { gap: 10 }, flex: { flex: 1, minWidth: 0 }, intro: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9 }, headingIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.accentSubtle }, title: { color: colors.foreground, fontSize: 17, fontWeight: '800' }, supporting: { color: colors.secondaryText, fontSize: 12, lineHeight: 17, marginTop: 3 }, addButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 11, backgroundColor: colors.accentSubtle }, addText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
    availableCard: { padding: 12, borderRadius: 14, backgroundColor: colors.accentSubtle }, value: { color: colors.foreground, fontSize: 15, fontWeight: '800' }, pocketCard: { gap: 9, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }, rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 9 }, pocketIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.muted }, rowTitle: { color: colors.foreground, fontSize: 14, fontWeight: '700' }, progressTrack: { height: 7, overflow: 'hidden', borderRadius: 6, backgroundColor: colors.muted }, progressFill: { height: '100%', borderRadius: 6, backgroundColor: colors.primary }, actions: { flexDirection: 'row', gap: 8 }, secondaryButton: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.accentSubtle }, secondaryText: { color: colors.accentText, fontSize: 13, fontWeight: '700' }, emptyCard: { alignItems: 'center', gap: 8, padding: 20, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.navyOverlay }, modalScroll: { flexGrow: 1, justifyContent: 'flex-end' }, editor: { maxHeight: '94%', gap: 9, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background }, transferSheet: { gap: 10, padding: 18, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background }, headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.muted }, label: { color: colors.secondaryText, fontSize: 12, fontWeight: '600' }, input: { minHeight: 44, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 11, backgroundColor: colors.card, color: colors.foreground, paddingHorizontal: 11, fontSize: 14 }, twoColumns: { flexDirection: 'row', gap: 9 }, iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, iconChoice: { width: 46, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }, iconChoiceActive: { borderColor: colors.accent, backgroundColor: colors.accentSubtle }, switchRow: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }, primaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.primary }, primaryButtonText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '800' }, archiveButton: { alignItems: 'center', gap: 2, padding: 8, borderRadius: 11, backgroundColor: colors.destructiveSubtle }, archiveText: { color: colors.destructive, fontSize: 13, fontWeight: '700' }, error: { color: colors.destructive, backgroundColor: colors.destructiveSubtle, padding: 9, borderRadius: 10, fontSize: 12 }, disabled: { opacity: 0.5 },
  })
}
