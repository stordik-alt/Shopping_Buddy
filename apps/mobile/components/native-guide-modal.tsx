import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react-native'
import { GUIDE_STEPS, QUICK_GUIDE_STEPS, clampStep, indexAfterModeSwitch, type GuideStep } from '../../../lib/guide'
import { useMobileTheme } from '../lib/theme'
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

export function NativeGuideModal({ visible, onNavigate, onClose }: {
  visible: boolean
  onNavigate: (tab: NativeTab) => void
  onClose: () => void
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [index, setIndex] = useState(0)
  const [detailed, setDetailed] = useState(false)
  const opacity = useRef(new Animated.Value(1)).current
  const steps = detailed ? GUIDE_STEPS : QUICK_GUIDE_STEPS
  const step = steps[index] ?? steps[0]

  useEffect(() => {
    if (visible) {
      setIndex(0)
      setDetailed(false)
      opacity.setValue(0)
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start()
    }
  }, [opacity, visible])

  useEffect(() => {
    if (visible && step) onNavigate(NATIVE_TABS[step.tab] ?? 'home')
  }, [index, onNavigate, step, visible])

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

  return <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
    <View style={styles.backdrop}>
      <Animated.View style={[styles.sheet, { opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
        <View style={styles.header}>
          <View style={styles.identity}>
            <View style={styles.mascot}><Image accessibilityLabel="Anitka" resizeMode="contain" source={require('../assets/anitka-guide-front.webp')} style={styles.mascotImage} /></View>
            <View style={styles.identityText}><Text style={styles.eyebrow}>PRŮVODCE APLIKACÍ · {index + 1}/{steps.length}</Text><Text style={styles.title}>{step.title}</Text></View>
          </View>
          <Pressable accessibilityLabel="Zavřít průvodce" accessibilityRole="button" onPress={onClose} style={styles.close}><X color={colors.secondaryText} size={20} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.copy}>
          <Text style={styles.body}>{step.text}</Text>
          {step.where ? <View style={styles.where}><Text style={styles.whereLabel}>Kde to najdete</Text><Text style={styles.body}>{step.where}</Text></View> : null}
          {step.todo?.length ? <View style={styles.list}><Text style={styles.listTitle}>Co můžete udělat</Text>{step.todo.map((item) => <Text key={item} style={styles.listItem}>•  {item}</Text>)}</View> : null}
          {!detailed && step.also?.length ? <View style={styles.list}><Text style={styles.listTitle}>Další možnosti</Text>{step.also.map((item) => <Text key={item} style={styles.listItem}>•  {item}</Text>)}</View> : null}
          {detailed && step.why?.length ? <View style={styles.list}><Text style={styles.listTitle}>Proč na tom záleží</Text>{step.why.map((item) => <Text key={item} style={styles.listItem}>•  {item}</Text>)}</View> : null}
        </ScrollView>
        <View style={styles.footer}>
          <Pressable accessibilityRole="button" onPress={toggleMode} style={styles.modeButton}><Text style={styles.modeText}>{detailed ? 'Stručně' : 'Podrobně'}</Text></Pressable>
          <View style={styles.dots}>{dots}</View>
          {last && step.secondaryCta ? <Pressable accessibilityRole="button" onPress={() => { onNavigate(NATIVE_TABS[step.secondaryCta!.tab] ?? 'home'); onClose() }} style={styles.secondaryCta}><Text style={styles.modeText}>{step.secondaryCta.label}</Text></Pressable> : null}
          <View style={styles.actions}>
            {index === 0 ? <Pressable accessibilityRole="button" onPress={onClose} style={styles.backButton}><Text style={styles.backText}>Přeskočit</Text></Pressable> : <Pressable accessibilityLabel="Předchozí krok" accessibilityRole="button" onPress={() => go(-1)} style={styles.backButton}><ArrowLeft color={colors.secondaryText} size={17} /><Text style={styles.backText}>Zpět</Text></Pressable>}
            <Pressable accessibilityRole="button" onPress={() => go(1)} style={styles.nextButton}>{last ? <Check color={colors.primaryForeground} size={18} /> : null}<Text style={styles.nextText}>{last ? (step.cta?.label ?? 'Dokončit') : 'Další'}</Text>{!last ? <ArrowRight color={colors.primaryForeground} size={17} /> : null}</Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  </Modal>
}

function useStyles() {
  const { colors } = useMobileTheme()
  return useMemo(() => StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'center', backgroundColor: colors.navyOverlay, padding: 18 },
    sheet: { maxHeight: '88%', backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 24, padding: 17, gap: 10 },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
    mascot: { width: 58, height: 58, overflow: 'hidden', borderRadius: 18, backgroundColor: colors.accentSubtle },
    mascotImage: { width: 68, height: 68, marginLeft: -5, marginTop: -4 },
    identityText: { flex: 1, gap: 3 },
    eyebrow: { color: colors.accentText, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    title: { color: colors.foreground, fontSize: 18, fontWeight: '800', lineHeight: 23 },
    close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.muted },
    copy: { gap: 12, paddingVertical: 7 },
    body: { color: colors.secondaryText, fontSize: 14, lineHeight: 21 },
    where: { gap: 4, borderRadius: 14, padding: 12, backgroundColor: colors.muted },
    whereLabel: { color: colors.foreground, fontSize: 12, fontWeight: '700' },
    list: { gap: 5 },
    listTitle: { color: colors.foreground, fontSize: 13, fontWeight: '700' },
    listItem: { color: colors.secondaryText, fontSize: 13, lineHeight: 19 },
    footer: { gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
    modeButton: { alignSelf: 'flex-end', minHeight: 34, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 11, backgroundColor: colors.accentSubtle },
    secondaryCta: { alignSelf: 'stretch', minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    modeText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
    dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
    activeDot: { width: 19, backgroundColor: colors.primary },
    actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backButton: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8 },
    backText: { color: colors.secondaryText, fontSize: 13, fontWeight: '600' },
    nextButton: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 15, borderRadius: 13, backgroundColor: colors.primary },
    nextText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '700' },
  }), [colors])
}
