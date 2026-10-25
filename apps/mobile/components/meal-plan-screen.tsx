import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { unitLabel, type ItemUnit } from '@anitka/shared/units'
import { getAccessToken } from '../lib/auth'
import { RefreshButton } from './refresh-button'
import { useMobileTheme } from '../lib/theme'
import { useNativeGuideTarget } from './native-guide-targets'
import {
  generateMealPlan,
  getMealPlan,
  markMealCooked,
  MobileApiError,
  setMealServings,
  type MobileMealPlan,
  type MobileMealPlanOptions,
  type MobileMealType,
} from '../lib/shopping-list-api'

const MEAL_TYPES: MobileMealType[] = ['Snídaně', 'Oběd', 'Večeře', 'Svačina']
const MAX_MEAL_SERVINGS = 1000

function displayQuantity(quantity: number, unit: ItemUnit): string {
  const rounded = Math.round(quantity * 100) / 100
  return `${rounded} ${unitLabel(rounded, unit)}`
}

export function MealPlanScreen({ onAuthExpired }: { onAuthExpired: () => void }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const createGuideTarget = useNativeGuideTarget('mealplan-create')
  const [plan, setPlan] = useState<MobileMealPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageToken, setImageToken] = useState<string | null>(null)
  const [dayCount, setDayCount] = useState('7')
  const [budgetLimit, setBudgetLimit] = useState('0')
  const [mealTypes, setMealTypes] = useState<MobileMealType[]>(MEAL_TYPES)
  const [useStock, setUseStock] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [result, token] = await Promise.all([getMealPlan(), getAccessToken()])
      setPlan(result.plan)
      setImageToken(token)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Jídelníček se nepodařilo načíst.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setLoading(false)
    }
  }, [onAuthExpired])

  useEffect(() => {
    void load()
  }, [load])

  function toggleMealType(mealType: MobileMealType) {
    setMealTypes((current) => current.includes(mealType) ? current.filter((type) => type !== mealType) : [...current, mealType])
  }

  async function createPlan() {
    const parsedDays = Number(dayCount)
    const parsedBudget = Number(budgetLimit.replace(',', '.'))
    if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 7) {
      setError('Vyberte 1 až 7 dní.')
      return
    }
    if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
      setError('Rozpočet musí být nezáporné číslo.')
      return
    }
    if (mealTypes.length === 0) {
      setError('Vyberte alespoň jeden chod.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const options: MobileMealPlanOptions = { budgetLimit: parsedBudget, dayCount: parsedDays, mealTypes, useStock }
      const result = await generateMealPlan(options)
      setPlan(result.plan)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Jídelníček se nepodařilo vytvořit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setSaving(false)
    }
  }

  async function changeServings(day: string, mealType: MobileMealType, servings: number) {
    if (saving || !Number.isFinite(servings) || servings < 0 || servings > MAX_MEAL_SERVINGS) return
    setSaving(true)
    setError(null)
    try {
      const result = await setMealServings(day, mealType, servings)
      setPlan(result.plan)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Počet porcí se nepodařilo uložit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setSaving(false)
    }
  }

  async function cookMeal(day: string, mealType: MobileMealType) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await markMealCooked(day, mealType)
      if (result.plan) setPlan(result.plan)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Jídlo se nepodařilo označit jako uvařené.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setSaving(false)
    }
  }

  async function openSource(url: string) {
    try {
      await Linking.openURL(url)
    } catch {
      setError('Původní recept se nepodařilo otevřít.')
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" style={styles.scroll}>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Text numberOfLines={1} style={styles.title}>Jídelníček</Text>
          <Text style={styles.supporting}>Naplánujte jídla a upravte počet porcí.</Text>
        </View>
        <RefreshButton disabled={saving} loading={loading} onPress={() => void load()} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{plan ? 'Vytvořit nový jídelníček' : 'Vytvořit jídelníček'}</Text>
        <View style={styles.settingsRow}>
          <Text style={styles.label}>Počet dní (1–7)</Text>
          <TextInput accessibilityLabel="Počet dní jídelníčku" keyboardType="number-pad" maxLength={1} onChangeText={setDayCount} style={styles.numberInput} value={dayCount} />
        </View>
        <View style={styles.settingsRow}>
          <Text style={styles.label}>Rozpočet (Kč)</Text>
          <TextInput accessibilityLabel="Rozpočet jídelníčku" keyboardType="decimal-pad" onChangeText={setBudgetLimit} style={styles.numberInput} value={budgetLimit} />
        </View>
        <Text style={styles.label}>Chody</Text>
        <View style={styles.options}>
          {MEAL_TYPES.map((mealType) => {
            const selected = mealTypes.includes(mealType)
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                key={mealType}
                onPress={() => toggleMealType(mealType)}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{mealType}</Text>
              </Pressable>
            )
          })}
        </View>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: useStock }} onPress={() => setUseStock((current) => !current)} style={styles.stockOption}>
          <Text style={styles.stockCheck}>{useStock ? '☑' : '☐'}</Text>
          <Text style={styles.label}>Zohlednit zásoby domácnosti</Text>
        </Pressable>
        <Pressable ref={createGuideTarget} accessibilityRole="button" disabled={saving || loading} onPress={() => void createPlan()} style={[styles.primaryButton, (saving || loading) && styles.disabled]}>
          <Text style={styles.primaryButtonText}>{saving ? 'Ukládám…' : 'Vytvořit jídelníček'}</Text>
        </Pressable>
      </View>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading && !plan ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.supporting}>Načítání jídelníčku…</Text>
        </View>
      ) : !plan ? (
        <View style={styles.emptyCard}>
          <Text style={styles.sectionTitle}>Jídelníček zatím není vytvořen</Text>
          <Text style={styles.supporting}>Zvolte počet dní a chody a vytvořte plán pro domácnost.</Text>
        </View>
      ) : (
        <>
          <View style={styles.summary}>
            <Text style={styles.summaryText}>Týden od {plan.weekStart}</Text>
            <Text style={styles.summaryText}>{plan.pricingPending ? 'Cena není dostupná' : `Odhad ${plan.estimatedTotal} Kč`}</Text>
          </View>
          {plan.days.map((day) => (
            <View key={day.day} style={styles.dayCard}>
              <Text style={styles.sectionTitle}>{day.day}</Text>
              {day.meals.map(({ mealType, cooked, recipe }) => (
                <View key={`${day.day}-${mealType}`} style={styles.mealCard}>
                  {recipe.imageUrl && imageToken ? (
                    <Image
                      accessibilityLabel={`Obrázek receptu ${recipe.name}`}
                      source={{ uri: recipe.imageUrl, headers: { Authorization: ['Bearer', imageToken].join(' ') } }}
                      style={styles.photo}
                    />
                  ) : null}
                  <Text style={styles.mealType}>{mealType}{cooked ? ' · Uvařeno' : ''}</Text>
                  <Text style={styles.mealName}>{recipe.name}</Text>
                  {recipe.sourceName ? <Text style={styles.source}>{recipe.sourceName}</Text> : null}
                  <View style={styles.servingsRow}>
                    <Text style={styles.label}>Porce: {recipe.selectedServings}</Text>
                    <Pressable
                      accessibilityLabel={`Méně porcí: ${mealType}, ${day.day}`}
                      accessibilityRole="button"
                      disabled={saving || recipe.selectedServings <= 0}
                      onPress={() => void changeServings(day.day, mealType, Math.max(0, recipe.selectedServings - 1))}
                      style={styles.servingButton}
                    >
                      <Text style={styles.servingButtonText}>−</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Více porcí: ${mealType}, ${day.day}`}
                      accessibilityRole="button"
                      disabled={saving || recipe.selectedServings >= MAX_MEAL_SERVINGS}
                      onPress={() => void changeServings(day.day, mealType, recipe.selectedServings + 1)}
                      style={styles.servingButton}
                    >
                      <Text style={styles.servingButtonText}>+</Text>
                    </Pressable>
                  </View>
                  {!cooked ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void cookMeal(day.day, mealType)} style={[styles.cookedButton, saving && styles.disabled]}><Text style={styles.cookedButtonText}>{saving ? 'Ukládám…' : 'Označit jako uvařené'}</Text></Pressable> : null}
                  {recipe.ingredients.length > 0 ? (
                    <View style={styles.ingredients}>
                      <Text style={styles.label}>Suroviny</Text>
                      {recipe.ingredients.map((ingredient, index) => (
                        <Text key={`${ingredient.name}-${index}`} style={styles.ingredient}>
                          •  {ingredient.name} — {ingredient.sourceMeasure ?? displayQuantity(ingredient.quantity, ingredient.unit)}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {recipe.sourceUrl ? (
                    <Pressable accessibilityRole="link" onPress={() => void openSource(recipe.sourceUrl!)} style={styles.sourceLink}>
                      <Text style={styles.sourceLinkText}>Otevřít původní recept ↗</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  )
}

function useStyles() {
  const { colors } = useMobileTheme()
  return useMemo(() => StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 24 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  headingText: { flex: 1, minWidth: 0 },
  title: { color: colors.foreground, fontSize: 23, fontWeight: '700' },
  supporting: { color: colors.secondaryText, fontSize: 14, lineHeight: 20, marginTop: 4 },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, margin: 16, padding: 16, gap: 12 },
  sectionTitle: { color: colors.foreground, fontSize: 18, fontWeight: '700' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { color: colors.secondaryText, fontSize: 14, fontWeight: '600' },
  numberInput: { minWidth: 84, minHeight: 44, borderColor: colors.inputBorder, borderRadius: 10, borderWidth: 1, backgroundColor: colors.card, color: colors.foreground, paddingHorizontal: 12, textAlign: 'center', fontSize: 16 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: 40, justifyContent: 'center', borderColor: colors.inputBorder, borderRadius: 22, borderWidth: 1, paddingHorizontal: 12 },
  optionSelected: { backgroundColor: colors.accentSubtle, borderColor: colors.primary },
  optionText: { color: colors.secondaryText, fontSize: 14 },
  optionTextSelected: { color: colors.accentText, fontWeight: '700' },
  stockOption: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  stockCheck: { color: colors.primary, fontSize: 20 },
  primaryButton: { minHeight: 48, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  disabled: { opacity: 0.55 },
  primaryButtonText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  emptyCard: { alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginTop: 4, padding: 24, backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: 8 },
  error: { color: colors.destructive, backgroundColor: colors.destructiveSubtle, borderRadius: 12, marginHorizontal: 16, marginBottom: 8, padding: 12, fontSize: 14, lineHeight: 20 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 8, gap: 8 },
  summaryText: { color: colors.secondaryText, fontSize: 13, fontWeight: '600' },
  dayCard: { backgroundColor: colors.muted, borderRadius: 16, marginHorizontal: 16, marginTop: 8, padding: 12, gap: 8 },
  mealCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14, borderWidth: 1, padding: 12, gap: 8 },
  photo: { width: '100%', height: 180, borderRadius: 10, backgroundColor: colors.muted },
  mealType: { color: colors.accentText, fontSize: 13, fontWeight: '700' },
  mealName: { color: colors.foreground, fontSize: 17, fontWeight: '700' },
  source: { color: colors.secondaryText, fontSize: 13 },
  servingsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cookedButton: { minHeight: 42, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.accentSubtle, paddingHorizontal: 13 },
  cookedButtonText: { color: colors.accentText, fontSize: 14, fontWeight: '700' },
  servingButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.accentSubtle },
  servingButtonText: { color: colors.accentText, fontSize: 22, fontWeight: '700' },
  ingredients: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 8, gap: 4 },
  ingredient: { color: colors.secondaryText, fontSize: 14, lineHeight: 20 },
  sourceLink: { minHeight: 42, justifyContent: 'center' },
  sourceLinkText: { color: colors.accentText, fontSize: 14, fontWeight: '700' },
}), [colors])
}
