import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, House, Package, ShoppingCart, Store, Tag, UserRound, WalletCards, X, BookOpen } from 'lucide-react-native'
import { GUIDE_STEPS, QUICK_GUIDE_STEPS, clampStep, indexAfterModeSwitch, type GuideStep } from '../../../lib/guide'
import { useMobileTheme } from '../lib/theme'
import { measureFirstNativeGuideTarget, type NativeGuideFrame } from './native-guide-targets'
import type { NativeTab } from './native-parity-screens'

const NATIVE_TABS: Partial<Record<GuideStep['tab'], NativeTab>> = {
  Domů: 'home',
  Nákup: 'shopping',
  Zásoby: 'pantry',
  Rozpočet: 'budget',
  Akce: 'deals',
  Obchody: 'stores',
  Recepty: 'recipes',
  Profil: 'profile',
}

const SECTION_ICONS = {
  Domů: House,
  Nákup: ShoppingCart,
  Zásoby: Package,
  Rozpočet: WalletCards,
  Akce: Tag,
  Obchody: Store,
  Recepty: BookOpen,
  Profil: UserRound,
} as const

const NAV_TARGETS: Partial<Record<GuideStep['tab'], string>> = {
  Domů: 'nav-home', Nákup: 'nav-shopping', Zásoby: 'nav-pantry', Rozpočet: 'nav-budget',
  Akce: 'nav-more', Obchody: 'nav-more', Recepty: 'nav-more', Profil: 'nav-more',
}

export function NativeGuideModal({ visible, onNavigate, onClose }: {
  visible: boolean
  onNavigate: (tab: NativeTab, stepId?: string) => void
  onClose: () => void
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [index, setIndex] = useState(0)
  const [detailed, setDetailed] = useState(false)
  const [frame, setFrame] = useState<NativeGuideFrame | null>(null)
  const [navFrame, setNavFrame] = useState<NativeGuideFrame | null>(null)
  const opacity = useRef(new Animated.Value(1)).current
  const steps = detailed ? GUIDE_STEPS : QUICK_GUIDE_STEPS
  const step = steps[index] ?? steps[0]
  const SectionIcon = SECTION_ICONS[step.tab as keyof typeof SECTION_ICONS] ?? House
  const targetIds = step.target?.map((target) => target.nativeId) ?? []
  const nativeTargetId = targetIds.find((id) => id && id !== NAV_TARGETS[step.tab])
  const navTargetId = step.navHint === false ? undefined : NAV_TARGETS[step.tab]

  useEffect(() => {
    if (visible) {
      setIndex(0)
      setDetailed(false)
      opacity.setValue(0)
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start()
    }
  }, [opacity, visible])

  useEffect(() => {
    if (visible && step) onNavigate(NATIVE_TABS[step.tab] ?? 'home', step.id)
  }, [index, onNavigate, step, visible])

  useEffect(() => {
    if (!visible) {
      setFrame(null)
      setNavFrame(null)
      return
    }
    let active = true
    let attempts = 0
    setFrame(null)
    setNavFrame(null)
    const update = async () => {
      const [measured, measuredNav] = await Promise.all([
        measureFirstNativeGuideTarget([nativeTargetId]),
        measureFirstNativeGuideTarget([navTargetId]),
      ])
      if (!active) return
      setFrame(measured)
      setNavFrame(measuredNav)
      attempts += 1
      if (attempts >= 20) clearInterval(timer)
    }
    const timer = setInterval(() => void update(), 180)
    void update()
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [nativeTargetId, navTargetId, visible])

  function go(delta: -1 | 1) {
    const next = clampStep(index, delta, steps.length)
    if (next === index && delta < 0) return
    if (next === index && delta > 0) {
      if (step.cta?.tab) onNavigate(NATIVE_TABS[step.cta.tab] ?? 'home')
      onClose()
      return
    }
    Animated.timing(opacity, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      setIndex(next)
      opacity.setValue(0)
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start()
    })
  }

  function toggleMode() {
    const nextDetailed = !detailed
    const nextSteps = nextDetailed ? GUIDE_STEPS : QUICK_GUIDE_STEPS
    setIndex(indexAfterModeSwitch(step.id, steps, nextSteps))
    setDetailed(nextDetailed)
  }

  const dots = useMemo(() => steps.map((item, dot) => <View key={item.id} style={[styles.dot, dot === index && styles.activeDot]} />), [index, steps, styles])
  if (!step) return null
  const last = index === steps.length - 1
  const targetLabel = step.targetLabel
  const labelAbove = frame ? frame.y + frame.height > 450 : false
  const labelRight = frame ? frame.x > 180 : false

  return <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
    <View style={styles.backdrop}>
      {navFrame ? <View accessibilityLabel="Zvýrazněná navigace" pointerEvents="none" style={[styles.navSpotlight, { left: navFrame.x - 5, top: navFrame.y - 5, width: navFrame.width + 10, height: navFrame.height + 10 }]} /> : null}
      {frame ? <View accessibilityLabel={targetLabel ? `Zvýrazněná funkce: ${targetLabel}` : 'Zvýrazněná funkce'} pointerEvents="none" style={[styles.spotlight, { left: frame.x - 5, top: frame.y - 5, width: frame.width + 10, height: frame.height + 10 }]}>
        {targetLabel ? <View style={[styles.targetLabel, labelAbove ? styles.targetLabelAbove : styles.targetLabelBelow, labelRight ? styles.targetLabelRight : styles.targetLabelLeft]}>{labelAbove ? <ArrowDown color="#0a1a3f" size={14} /> : <ArrowUp color="#0a1a3f" size={14} />}<Text style={styles.targetLabelText}>{targetLabel}</Text></View> : null}
      </View> : null}
      <Animated.View accessibilityLabel="Průvodce aplikací" style={[styles.sheet, { opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
        <View style={styles.copyPanel}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>KROK {index + 1} Z {steps.length}</Text>
            <View style={styles.headerActions}>
              <Pressable accessibilityRole="button" accessibilityLabel={detailed ? 'Přepnout na stručného průvodce' : 'Přepnout na podrobného průvodce'} onPress={toggleMode} style={styles.modeButton}><Text style={styles.modeText}>{detailed ? 'Stručně' : 'Podrobně'}</Text></Pressable>
              <Pressable accessibilityLabel="Zavřít průvodce" accessibilityRole="button" onPress={onClose} style={styles.close}><X color={colors.secondaryText} size={19} /></Pressable>
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.copy}>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.body}>{step.text}</Text>
            {step.where ? <View style={styles.where}><Text style={styles.whereLabel}>Kde to najdete</Text><Text style={styles.body}>{step.where}</Text></View> : null}
            {step.todo?.length ? <View style={styles.list}><Text style={styles.listTitle}>Co můžete udělat</Text>{step.todo.map((item) => <Text key={item} style={styles.listItem}>•  {item}</Text>)}</View> : null}
            {!detailed && step.also?.length ? <View style={styles.list}><Text style={styles.listTitle}>Další možnosti</Text>{step.also.map((item) => <Text key={item} style={styles.listItem}>•  {item}</Text>)}</View> : null}
            {detailed && step.why?.length ? <View style={styles.list}><Text style={styles.listTitle}>Proč na tom záleží</Text>{step.why.map((item) => <Text key={item} style={styles.listItem}>•  {item}</Text>)}</View> : null}
          </ScrollView>
          <View style={styles.footer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dots}>{dots}</ScrollView>
            {last && step.secondaryCta ? <Pressable accessibilityRole="button" onPress={() => { onNavigate(NATIVE_TABS[step.secondaryCta!.tab] ?? 'home'); onClose() }} style={styles.secondaryCta}><Text style={styles.modeText}>{step.secondaryCta.label}</Text></Pressable> : null}
            <View style={styles.actions}>
              {index === 0 ? <Pressable accessibilityRole="button" onPress={onClose} style={styles.backButton}><Text style={styles.backText}>Přeskočit</Text></Pressable> : <Pressable accessibilityLabel="Předchozí krok" accessibilityRole="button" onPress={() => go(-1)} style={styles.backButton}><ArrowLeft color={colors.secondaryText} size={17} /><Text style={styles.backText}>Zpět</Text></Pressable>}
              <Pressable accessibilityRole="button" onPress={() => go(1)} style={styles.nextButton}>{last ? <Check color={colors.primaryForeground} size={18} /> : null}<Text style={styles.nextText}>{last ? (step.cta?.label ?? 'Dokončit') : 'Další'}</Text>{!last ? <ArrowRight color={colors.primaryForeground} size={17} /> : null}</Pressable>
            </View>
          </View>
        </View>
        <View style={styles.mascotColumn}>
          <View style={styles.sectionIcon}><SectionIcon color={colors.accentText} size={21} /></View>
          <Image accessibilityLabel="Anitka" resizeMode="contain" source={require('../assets/anitka-guide-front.webp')} style={styles.mascotImage} />
        </View>
      </Animated.View>
    </View>
  </Modal>
}

function useStyles() {
  const { colors } = useMobileTheme()
  return useMemo(() => StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 8, paddingBottom: 86 },
    spotlight: { position: 'absolute', zIndex: 1, borderWidth: 2, borderColor: '#03bcdb', borderRadius: 16, shadowColor: '#03bcdb', shadowOpacity: 0.85, shadowRadius: 9, elevation: 12 },
    navSpotlight: { position: 'absolute', zIndex: 1, borderWidth: 2, borderStyle: 'dashed', borderColor: '#03bcdb', borderRadius: 16 },
    targetLabel: { position: 'absolute', zIndex: 2, maxWidth: 230, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#03bcdb' },
    targetLabelAbove: { bottom: '100%', marginBottom: 8 },
    targetLabelBelow: { top: '100%', marginTop: 8 },
    targetLabelLeft: { left: 0 },
    targetLabelRight: { right: 0 },
    targetLabelText: { color: '#0a1a3f', fontSize: 11, fontWeight: '800' },
    sheet: { zIndex: 2, alignSelf: 'center', width: '100%', maxWidth: 448, maxHeight: '57%', flexDirection: 'row-reverse', overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.elevated, shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 18, elevation: 14 },
    copyPanel: { flex: 1, minWidth: 0, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 11 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
    eyebrow: { flex: 1, color: colors.mutedText, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    modeButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 10 },
    modeText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
    close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.muted },
    copy: { gap: 9, paddingTop: 4, paddingBottom: 6 },
    title: { color: colors.foreground, fontSize: 17, fontWeight: '800', lineHeight: 22 },
    body: { color: colors.secondaryText, fontSize: 13, lineHeight: 19 },
    where: { gap: 3, borderRadius: 12, padding: 9, backgroundColor: colors.muted },
    whereLabel: { color: colors.foreground, fontSize: 11, fontWeight: '700' },
    list: { gap: 4 },
    listTitle: { color: colors.foreground, fontSize: 12, fontWeight: '700' },
    listItem: { color: colors.secondaryText, fontSize: 12, lineHeight: 17 },
    footer: { gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 7 },
    dots: { minHeight: 8, flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 5 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
    activeDot: { width: 19, backgroundColor: colors.primary },
    secondaryCta: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 11 },
    actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8 },
    backText: { color: colors.secondaryText, fontSize: 13, fontWeight: '600' },
    nextButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.primary },
    nextText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '700' },
    mascotColumn: { width: 96, flexShrink: 0, alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, backgroundColor: colors.accentSubtle },
    sectionIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: colors.elevated, elevation: 2 },
    mascotImage: { width: 132, height: 184, marginLeft: -36 },
  }), [colors])
}
