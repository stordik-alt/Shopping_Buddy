import { useMemo } from 'react'
import { AlertTriangle, CalendarClock, CalendarDays, ChevronRight } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { BUDGET_WARNING_RATIO, budgetAllowances, budgetLevel, type BudgetAllowances } from '../../../lib/budget'
import { useMobileTheme } from '../lib/theme'

const HERO_MUTED = 'rgba(255, 255, 255, 0.78)'
const HERO_TRACK = 'rgba(255, 255, 255, 0.2)'
const HERO_DIVIDER = 'rgba(255, 255, 255, 0.16)'
const ACCENT_FOREGROUND = '#0a1a3f'

export function nativeBudgetDaysLeft(today: string | undefined, periodEnd: string | undefined): number | null {
  if (!today || !periodEnd) return null
  const elapsed = Math.floor((Date.parse(`${periodEnd}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
  return Number.isFinite(elapsed) ? Math.max(0, elapsed + 1) : null
}

export function NativeBudgetHero({
  budget,
  spent,
  remaining,
  currency,
  today,
  periodEnd,
  onOpen,
  onSetBudget,
  compact = false,
}: {
  budget: number
  spent: number
  remaining: number
  currency: string
  today?: string
  periodEnd?: string
  onOpen?: () => void
  onSetBudget?: () => void
  compact?: boolean
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const level = budgetLevel(spent, budget)
  const spentPercent = budget > 0 ? Math.round((spent / budget) * 100) : 0
  const progressPercent = Math.min(100, spentPercent)
  const daysLeft = nativeBudgetDaysLeft(today, periodEnd)
  const perDay = budget > 0 && remaining > 0 && daysLeft ? remaining / daysLeft : null

  if (budget <= 0) {
    return (
      <View style={[styles.hero, compact && styles.heroCompact]}>
        <Text style={styles.eyebrow}>Rozpočet domácnosti</Text>
        <Text style={[styles.value, compact && styles.valueCompact]}>Nastavte si rozpočtový limit</Text>
        <Text style={styles.description}>
          Pak uvidíte, kolik vám zbývá{spent > 0 ? ` (zatím utraceno ${money(spent, currency)})` : ''}, a upozorníme vás při 80 % i 100 %.
        </Text>
        {onSetBudget ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Nastavit rozpočet" onPress={onSetBudget} style={styles.setBudgetButton}>
            <Text style={styles.setBudgetText}>Nastavit rozpočet</Text>
          </Pressable>
        ) : null}
      </View>
    )
  }

  const content = (
    <>
      <View style={styles.headingRow}>
        <Text style={styles.eyebrow}>{level === 'over' ? 'Rozpočet překročen o' : 'Zbývá v rozpočtu'}</Text>
        <View style={styles.headingActions}>
          {level !== 'ok' ? (
            <View style={[styles.levelBadge, level === 'over' && styles.levelBadgeOver]}>
              <AlertTriangle color={level === 'over' ? '#ffb4ad' : '#ffd27a'} size={13} />
              <Text style={[styles.levelText, level === 'over' && styles.levelTextOver]}>
                {level === 'over' ? 'Limit překročen' : 'Přes 80 % limitu'}
              </Text>
            </View>
          ) : null}
          {onOpen ? <ChevronRight color={HERO_MUTED} size={20} /> : null}
        </View>
      </View>
      <Text style={[styles.amount, compact && styles.amountCompact]}>{money(Math.abs(remaining), currency)}</Text>
      <View
        accessibilityLabel={`Čerpání rozpočtu ${progressPercent} procent`}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: progressPercent }}
        style={styles.progressTrack}
      >
        <View style={[styles.progressFill, level === 'warning' && styles.progressWarning, level === 'over' && styles.progressOver, { width: `${progressPercent}%` }]} />
        <View style={[styles.progressNotch, { left: `${BUDGET_WARNING_RATIO * 100}%` }]} />
      </View>
      <View style={styles.spentRow}>
        <Text style={styles.spentText}>Utraceno <Text style={styles.spentStrong}>{money(spent, currency)}</Text> z {money(budget, currency)}</Text>
        <Text style={styles.spentStrong}>{spentPercent} %</Text>
      </View>
      {level !== 'over' && perDay != null && daysLeft != null ? (
        <View style={styles.paceRow}>
          <CalendarDays color={HERO_MUTED} size={14} />
          <Text style={styles.paceText}>
            Na den zbývá <Text style={styles.spentStrong}>{money(perDay, currency)}</Text>
            {daysLeft > 1 ? ` (${daysLeft} dní do konce období)` : ' (poslední den období)'}
          </Text>
        </View>
      ) : null}
    </>
  )

  if (onOpen) {
    return (
      <Pressable
        accessibilityLabel={`Rozpočet domácnosti, zbývá ${money(Math.abs(remaining), currency)}, vyčerpáno ${progressPercent} procent`}
        accessibilityRole="button"
        onPress={onOpen}
        style={[styles.hero, compact && styles.heroCompact]}
      >
        {content}
      </Pressable>
    )
  }

  return <View style={[styles.hero, compact && styles.heroCompact]}>{content}</View>
}

export function NativeBudgetAllowances({
  budget,
  spent,
  currency,
  today,
  periodEnd,
  onSetBudget,
}: {
  budget: number
  spent: number
  currency: string
  today?: string
  periodEnd?: string
  onSetBudget?: () => void
}) {
  const styles = useStyles()
  const daysLeft = nativeBudgetDaysLeft(today, periodEnd)
  const allowances = budgetAllowances(budget, spent, daysLeft ?? 0)

  return (
    <View accessibilityLabel="Doporučená útrata" style={styles.allowancesGrid}>
      <NativeAllowanceCard
        allowances={allowances}
        currency={currency}
        daysLeft={daysLeft ?? 0}
        kind="day"
        onSetBudget={onSetBudget}
      />
      <NativeAllowanceCard
        allowances={allowances}
        currency={currency}
        daysLeft={daysLeft ?? 0}
        kind="week"
        onSetBudget={onSetBudget}
      />
    </View>
  )
}

function NativeAllowanceCard({
  allowances,
  currency,
  daysLeft,
  kind,
  onSetBudget,
}: {
  allowances: BudgetAllowances
  currency: string
  daysLeft: number
  kind: 'day' | 'week'
  onSetBudget?: () => void
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const title = kind === 'day' ? 'Doporučená útrata na den' : 'Doporučená útrata na týden'
  const weekDays = Math.min(7, daysLeft)

  return (
    <View accessibilityLabel={title} style={styles.allowanceCard}>
      <View style={styles.allowanceHeading}>
        <CalendarClock color={colors.secondaryText} size={15} />
        <Text style={styles.allowanceTitle}>{title}</Text>
      </View>
      {allowances.status === 'available' ? (
        <>
          <Text style={styles.allowanceAmount}>{money(kind === 'day' ? allowances.perDay : allowances.perWeek, currency)}</Text>
          <Text style={styles.allowanceDescription}>
            Orientačně {kind === 'day' ? 'na den' : `na ${dayCountLabel(weekDays)}`}; dnešek se počítá.
          </Text>
        </>
      ) : allowances.status === 'overspent' ? (
        <>
          <Text style={styles.allowanceDanger}>Překročeno o {money(allowances.overrun, currency)}</Text>
          <Text style={styles.allowanceDescription}>Teď je potřeba omezit výdaje; kladná útrata se nedoporučuje.</Text>
        </>
      ) : allowances.status === 'exhausted' ? (
        <>
          <Text style={styles.allowanceStatus}>Rozpočet je vyčerpán</Text>
          <Text style={styles.allowanceDescription}>Další výdaje by znamenaly překročení limitu.</Text>
        </>
      ) : allowances.status === 'missing-budget' ? (
        <>
          <Text style={styles.allowanceStatus}>Chybí rozpočtový limit</Text>
          {onSetBudget ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Nastavit limit" hitSlop={8} onPress={onSetBudget}>
              <Text style={styles.allowanceLink}>Nastavit limit</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <Text style={styles.allowanceStatus}>Rozpočtové období skončilo</Text>
      )}
    </View>
  )
}

function dayCountLabel(days: number) {
  if (days === 1) return '1 den'
  if (days >= 2 && days <= 4) return `${days} dny`
  return `${days} dní`
}

function money(amount: number, currency: string) {
  const rounded = Math.round(amount)
  try {
    return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: 0 }).format(rounded)
  } catch {
    return `${rounded.toLocaleString('cs-CZ')} ${currency}`
  }
}

function useStyles() {
  const { colors } = useMobileTheme()
  return useMemo(() => StyleSheet.create({
    hero: { gap: 12, overflow: 'hidden', borderRadius: 26, backgroundColor: colors.hero, padding: 20 },
    heroCompact: { gap: 9, borderRadius: 24, padding: 18 },
    eyebrow: { color: HERO_MUTED, fontSize: 13, fontWeight: '500' },
    headingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    headingActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    levelBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 7, paddingVertical: 5 },
    levelBadgeOver: { backgroundColor: 'rgba(255,153,144,0.16)' },
    levelText: { color: '#ffd27a', fontSize: 11, fontWeight: '700' },
    levelTextOver: { color: '#ffb4ad' },
    value: { color: colors.heroForeground, fontSize: 24, lineHeight: 31, fontWeight: '700' },
    valueCompact: { fontSize: 22, lineHeight: 29 },
    amount: { color: colors.heroForeground, fontSize: 36, lineHeight: 43, fontWeight: '700', letterSpacing: -0.8 },
    amountCompact: { fontSize: 30, lineHeight: 37 },
    description: { color: HERO_MUTED, fontSize: 13, lineHeight: 19 },
    setBudgetButton: { minHeight: 44, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.accent, paddingHorizontal: 16, marginTop: 2 },
    setBudgetText: { color: ACCENT_FOREGROUND, fontSize: 13, fontWeight: '700' },
    progressTrack: { height: 8, overflow: 'hidden', borderRadius: 8, backgroundColor: HERO_TRACK, marginTop: 1 },
    progressFill: { height: '100%', borderRadius: 8, backgroundColor: colors.accent },
    progressWarning: { backgroundColor: '#ffd27a' },
    progressOver: { backgroundColor: '#ff9990' },
    progressNotch: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.hero },
    spentRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 12, rowGap: 3, marginTop: 1 },
    spentText: { flexShrink: 1, color: HERO_MUTED, fontSize: 12, lineHeight: 17 },
    spentStrong: { color: colors.heroForeground, fontWeight: '700' },
    paceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderTopColor: HERO_DIVIDER, borderTopWidth: 1, paddingTop: 9 },
    paceText: { flex: 1, color: HERO_MUTED, fontSize: 12, lineHeight: 17 },
    allowancesGrid: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
    allowanceCard: { flexBasis: '46%', flexGrow: 1, minWidth: 0, minHeight: 130, gap: 5, borderColor: colors.border, borderRadius: 18, borderWidth: 1, backgroundColor: colors.card, padding: 13 },
    allowanceHeading: { minHeight: 38, flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
    allowanceTitle: { flex: 1, color: colors.secondaryText, fontSize: 12, lineHeight: 17, fontWeight: '600' },
    allowanceAmount: { color: colors.foreground, fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.3 },
    allowanceStatus: { color: colors.foreground, fontSize: 14, lineHeight: 19, fontWeight: '700' },
    allowanceDanger: { color: colors.destructive, fontSize: 14, lineHeight: 19, fontWeight: '700' },
    allowanceDescription: { color: colors.mutedText, fontSize: 11, lineHeight: 16 },
    allowanceLink: { color: colors.accentText, fontSize: 12, lineHeight: 18, fontWeight: '700', textDecorationLine: 'underline' },
  }), [colors])
}
