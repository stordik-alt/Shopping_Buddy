import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Check, ClipboardCheck, Minus, Plus, X } from 'lucide-react-native'
import { ITEM_UNITS, unitLabel, type ItemUnit } from '@anitka/shared/units'
import { addPantryItem, MobileApiError, getPantry, removePantryItem, reviewPantry, updatePantryItem, type MobilePantryItem, type MobilePantryState } from '../lib/shopping-list-api'
import { RefreshButton } from './refresh-button'
import { useMobileTheme } from '../lib/theme'
import { getAccessToken } from '../lib/auth'
import { ProductIllustration } from './product-illustration'
import { PANTRY_QUANTITY_STEP, splitPantryReview } from '../../../lib/pantry'

const QUANTITY_STEP = { ks: 1, kg: 0.1, g: 10, l: 0.1, ml: 10, dávka: 1 } as const
const CATEGORIES = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní'] as const
type ReviewScope = 'location' | 'uncertain' | 'all'

function quantityLabel(value: number): string {
  return value.toLocaleString('cs-CZ', { maximumFractionDigits: 3 })
}

export function PantryScreen({ onAuthExpired, reviewToken = 0, onReviewAddToShopping }: {
  onAuthExpired: () => void
  reviewToken?: number
  onReviewAddToShopping: (items: MobilePantryItem[]) => Promise<{ added: number; failed: boolean }>
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [pantry, setPantry] = useState<MobilePantryState | null>(null)
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newQuantity, setNewQuantity] = useState('1')
  const [newUnit, setNewUnit] = useState<ItemUnit>('ks')
  const [newCategory, setNewCategory] = useState<(typeof CATEGORIES)[number]>('Potraviny')
  const [error, setError] = useState<string | null>(null)
  const [imageToken, setImageToken] = useState<string | null>(null)
  const [reviewScope, setReviewScope] = useState<ReviewScope | null>(null)
  const [reviewGone, setReviewGone] = useState<Set<string>>(new Set())
  const [reviewRemaining, setReviewRemaining] = useState<Map<string, number>>(new Map())
  const [reviewAddToList, setReviewAddToList] = useState(true)
  const [reviewSaving, setReviewSaving] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const handledReviewToken = useRef(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getPantry()
      setPantry(result)
      if (result.items.some((item) => item.hasImage)) {
        try { setImageToken(await getAccessToken()) } catch { setImageToken(null) }
      }
      setSelectedPlace((current) => result.places.some((place) => place.key === current)
        ? current
        : result.places.find((place) => result.items.some((item) => (item.customPlaceId ? `custom:${item.customPlaceId}` : item.location) === place.key))?.key
          ?? result.places[0]?.key
          ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Zásoby se nepodařilo načíst.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setLoading(false)
    }
  }, [onAuthExpired])

  useEffect(() => {
    void load()
  }, [load])

  const selected = pantry?.places.find((place) => place.key === selectedPlace)
  const selectedItems = useMemo(
    () => pantry?.items.filter((item) => (item.customPlaceId ? `custom:${item.customPlaceId}` : item.location) === selectedPlace) ?? [],
    [pantry, selectedPlace],
  )
  const reviewGroups = useMemo(() => {
    if (!pantry || !reviewScope) return []
    const inScope = reviewScope === 'all'
      ? pantry.items
      : reviewScope === 'uncertain'
        ? pantry.items.filter((item) => item.needsCheck)
        : pantry.items.filter((item) => (item.customPlaceId ? `custom:${item.customPlaceId}` : item.location) === selectedPlace)
    return pantry.places.map((place) => ({
      key: place.key,
      name: place.name,
      items: inScope.filter((item) => (item.customPlaceId ? `custom:${item.customPlaceId}` : item.location) === place.key).sort((a, b) =>
        Number(Boolean(b.askedAt)) - Number(Boolean(a.askedAt)) || a.addedAt.localeCompare(b.addedAt) || a.name.localeCompare(b.name, 'cs')),
    })).filter((group) => group.items.length > 0)
  }, [pantry, reviewScope, selectedPlace])
  const reviewItems = useMemo(() => reviewGroups.flatMap((group) => group.items), [reviewGroups])
  const { goneIds: reviewedGoneIds, keptIds: reviewedKeptIds } = useMemo(
    () => splitPantryReview(reviewItems.map((item) => item.id), reviewGone),
    [reviewItems, reviewGone],
  )
  const reviewQuantities = useMemo(() => reviewedKeptIds.flatMap((id) => {
    const quantity = reviewRemaining.get(id)
    const item = reviewItems.find((entry) => entry.id === id)
    return quantity != null && item && quantity !== item.quantity ? [{ id, quantity }] : []
  }), [reviewItems, reviewRemaining, reviewedKeptIds])

  const openReview = useCallback((scope: ReviewScope) => {
    if (!pantry) return
    setReviewGone(new Set(pantry.items.filter((item) => item.likelyGone).map((item) => item.id)))
    setReviewRemaining(new Map())
    setReviewAddToList(true)
    setReviewError(null)
    setReviewScope(scope)
  }, [pantry])

  useEffect(() => {
    if (!reviewToken || reviewToken === handledReviewToken.current || !pantry) return
    handledReviewToken.current = reviewToken
    openReview(pantry.items.some((item) => item.needsCheck) ? 'uncertain' : 'all')
  }, [openReview, reviewToken, pantry])

  function toggleReviewGone(itemId: string) {
    setReviewGone((current) => {
      const next = new Set(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
    setReviewRemaining((current) => {
      const next = new Map(current)
      next.delete(itemId)
      return next
    })
  }

  function changeReviewQuantity(item: MobilePantryItem, direction: -1 | 1) {
    const current = reviewRemaining.get(item.id) ?? item.quantity
    const next = Math.round((current + direction * PANTRY_QUANTITY_STEP[item.unit]) * 1000) / 1000
    if (next <= 0) {
      toggleReviewGone(item.id)
      return
    }
    setReviewRemaining((values) => new Map(values).set(item.id, next))
  }

  async function saveReview() {
    if (!pantry || !reviewScope || reviewSaving || reviewItems.length === 0) return
    setReviewSaving(true)
    setReviewError(null)
    try {
      const result = await reviewPantry({ reviewedIds: reviewItems.map((item) => item.id), goneIds: reviewedGoneIds, quantities: reviewQuantities })
      const gone = new Set(reviewedGoneIds)
      const kept = new Set(reviewedKeptIds)
      const quantityMap = new Map(reviewQuantities.map((change) => [change.id, change.quantity]))
      const goneItems = reviewItems.filter((item) => gone.has(item.id))
      const now = new Date().toISOString()
      setPantry((current) => current ? {
        ...current,
        items: current.items.filter((item) => !gone.has(item.id)).map((item) => kept.has(item.id)
          ? { ...item, addedAt: now, askedAt: null, likelyGone: false, needsCheck: false, estimateReason: null, quantity: quantityMap.get(item.id) ?? item.quantity }
          : item),
      } : current)

      let listResult = { added: 0, failed: false }
      if (reviewAddToList && goneItems.length > 0) listResult = await onReviewAddToShopping(goneItems)
      setReviewScope(null)
      const summary = `Odebráno: ${result.removed} · potvrzeno: ${result.confirmed} · upraveno množství: ${result.adjusted}.${listResult.added ? ` Na seznam přidáno: ${listResult.added}.` : ''}${listResult.failed ? ' Zásoby jsou uložené, ale některé položky se na seznam nepodařilo přidat.' : ''}`
      Alert.alert('Kontrola zásob uložena', summary)
    } catch (caught) {
      setReviewError(caught instanceof Error ? caught.message : 'Kontrolu se nepodařilo uložit. Nic se nezměnilo.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setReviewSaving(false)
    }
  }

  async function saveChange(item: MobilePantryItem, change: { quantity: number } | { placeKey: string }) {
    if (busyItemId) return
    setBusyItemId(item.id)
    setError(null)
    try {
      await updatePantryItem(item.id, change)
      setPantry((current) => current
        ? {
            ...current,
            items: current.items.map((entry) => {
              if (entry.id !== item.id) return entry
              if ('quantity' in change) return { ...entry, quantity: change.quantity }
              const customPlaceId = change.placeKey.startsWith('custom:') ? change.placeKey.slice('custom:'.length) : null
              return { ...entry, location: customPlaceId ? entry.location : change.placeKey, customPlaceId }
            }),
          }
        : current)
      setEditingPlaceId(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Změnu zásob se nepodařilo uložit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setBusyItemId(null)
    }
  }

  async function saveNewItem() {
    const quantity = Number(newQuantity.trim().replace(',', '.'))
    if (!newName.trim() || !Number.isFinite(quantity) || quantity <= 0 || adding || !selectedPlace) {
      setError('Zadejte název položky a množství větší než 0.')
      return
    }
    setAdding(true)
    setError(null)
    try {
      await addPantryItem({ name: newName.trim(), quantity, unit: newUnit, category: newCategory, placeKey: selectedPlace })
      setAddOpen(false)
      setNewName('')
      setNewQuantity('1')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Položku se nepodařilo přidat do zásob.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setAdding(false)
    }
  }

  function confirmRemove(item: MobilePantryItem) {
    Alert.alert('Odebrat ze zásob?', `Odebrat položku ${item.name}?`, [
      { text: 'Zrušit', style: 'cancel' },
      { text: 'Odebrat', style: 'destructive', onPress: () => { void (async () => {
        setBusyItemId(item.id)
        try {
          await removePantryItem(item.id)
          setPantry((current) => current ? { ...current, items: current.items.filter((entry) => entry.id !== item.id) } : current)
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : 'Položku se nepodařilo odebrat.')
          if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
        } finally {
          setBusyItemId(null)
        }
      })() } },
    ])
  }

  return (
    <>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" style={styles.scroll}>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Text numberOfLines={1} style={styles.title}>Zásoby</Text>
          <Text style={styles.supporting}>Vyberte místo, kde jsou věci uložené.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setAddOpen(true)} style={styles.addButton}><Text style={styles.addButtonText}>＋ Přidat</Text></Pressable>
        {pantry?.items.length ? <Pressable accessibilityRole="button" onPress={() => openReview('location')} style={styles.reviewOpenButton}><ClipboardCheck color={colors.accentText} size={17} /><Text style={styles.reviewOpenText}>Kontrola</Text></Pressable> : null}
        <RefreshButton loading={loading} onPress={() => void load()} />
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

      {loading && !pantry ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.supporting}>Načítání zásob…</Text>
        </View>
      ) : pantry ? (
        <>
          <ScrollView horizontal contentContainerStyle={styles.placeList} showsHorizontalScrollIndicator={false}>
            {pantry.places.map((place) => {
              const count = pantry.items.filter((item) => (item.customPlaceId ? `custom:${item.customPlaceId}` : item.location) === place.key).length
              const active = selectedPlace === place.key
              const countLabel = count === 1 ? 'položka' : count >= 2 && count <= 4 ? 'položky' : 'položek'
              return (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  key={place.key}
                  onPress={() => { setSelectedPlace(place.key); setEditingPlaceId(null) }}
                  style={[styles.place, active && styles.placeActive]}
                >
                  <Text style={[styles.placeName, active && styles.placeNameActive]}>{place.name}</Text>
                  <Text style={[styles.placeCount, active && styles.placeNameActive]}>{count} {countLabel}</Text>
                </Pressable>
              )
            })}
          </ScrollView>

          {selected ? <Text style={styles.sectionTitle}>{selected.name}</Text> : null}
          {selectedItems.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.sectionTitle}>Toto místo je prázdné</Text>
              <Text style={styles.supporting}>Položky ze zásob se zobrazí po jejich přidání nebo nákupu.</Text>
            </View>
          ) : selectedItems.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemHeading}>
                <ProductIllustration
                  category={item.category}
                  imageToken={imageToken}
                  productTypeKey={item.productTypeKey}
                  size={54}
                  subcategory={item.subcategory}
                />
                <View style={styles.itemHeadingText}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemCategory}>{item.category}{item.subcategory ? ` · ${item.subcategory}` : ''}</Text>
                </View>
              </View>
              <View style={styles.quantityRow}>
                <Pressable
                  accessibilityLabel={`Ubrat ${item.unit} položky ${item.name}`}
                  accessibilityRole="button"
                  disabled={busyItemId !== null || item.quantity <= 0}
                  onPress={() => void saveChange(item, { quantity: Math.max(0, Math.round((item.quantity - QUANTITY_STEP[item.unit]) * 1000) / 1000) })}
                  style={[styles.quantityButton, (busyItemId !== null || item.quantity <= 0) && styles.disabled]}
                >
                  <Text style={styles.quantityButtonText}>−</Text>
                </Pressable>
                <Text style={styles.quantity}>{quantityLabel(item.quantity)} {unitLabel(item.quantity, item.unit)}</Text>
                <Pressable
                  accessibilityLabel={`Přidat ${item.unit} položky ${item.name}`}
                  accessibilityRole="button"
                  disabled={busyItemId !== null}
                  onPress={() => void saveChange(item, { quantity: Math.round((item.quantity + QUANTITY_STEP[item.unit]) * 1000) / 1000 })}
                  style={[styles.quantityButton, busyItemId !== null && styles.disabled]}
                >
                  <Text style={styles.quantityButtonText}>+</Text>
                </Pressable>
                {item.unitQuantity != null && item.unitUnit
                  ? <Text style={styles.packageSize}>· {quantityLabel(item.unitQuantity)} {item.unitUnit}</Text>
                  : null}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setEditingPlaceId(editingPlaceId === item.id ? null : item.id)}
                style={styles.moveButton}
              >
                <Text style={styles.moveText}>Přesunout do jiného místa</Text>
              </Pressable>
              {editingPlaceId === item.id ? (
                <View style={styles.destinationList}>
                  {pantry.places.filter((place) => place.key !== (item.customPlaceId ? `custom:${item.customPlaceId}` : item.location)).map((place) => (
                    <Pressable
                      accessibilityRole="button"
                      disabled={busyItemId !== null}
                      key={place.key}
                      onPress={() => void saveChange(item, { placeKey: place.key })}
                      style={styles.destination}
                    >
                      <Text style={styles.destinationText}>{place.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Pressable accessibilityRole="button" disabled={busyItemId === item.id} onPress={() => confirmRemove(item)} style={styles.removeButton}>
                <Text style={styles.removeText}>{busyItemId === item.id ? 'Odebírám…' : 'Odebrat ze zásob'}</Text>
              </Pressable>
            </View>
          ))}
          {pantry.items.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.sectionTitle}>Zásoby jsou prázdné</Text>
              <Text style={styles.supporting}>Nakoupené položky se do zásob přidávají automaticky.</Text>
            </View>
          ) : null}
        </>
      ) : !error ? (
        <View style={styles.emptyCard}><Text style={styles.supporting}>Zásoby nejsou dostupné. Zkuste stránku obnovit.</Text></View>
      ) : null}
    </ScrollView>
      <Modal animationType="slide" onRequestClose={() => !reviewSaving && setReviewScope(null)} transparent visible={reviewScope !== null}>
        <View style={styles.reviewBackdrop}>
          <View style={styles.reviewSheet}>
            <View style={styles.reviewHeading}>
              <View style={styles.reviewHeadingText}>
                <Text style={styles.editorTitle}>Kontrola zásob</Text>
                <Text style={styles.supporting}>Označte, co došlo. Ostatní se potvrdí jako „Mám“.</Text>
              </View>
              <Pressable accessibilityLabel="Zavřít kontrolu zásob" disabled={reviewSaving} onPress={() => setReviewScope(null)} style={styles.closeButton}><X color={colors.foreground} size={20} /></Pressable>
            </View>
            <View style={styles.reviewScopes}>
              {([['uncertain', 'K ověření'], ['location', selected?.name ?? 'Místo'], ['all', 'Vše']] as [ReviewScope, string][]).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: reviewScope === value }} disabled={reviewSaving} onPress={() => setReviewScope(value)} style={[styles.reviewScope, reviewScope === value && styles.reviewScopeActive, reviewSaving && styles.disabled]}><Text style={[styles.reviewScopeText, reviewScope === value && styles.reviewScopeTextActive]}>{label}</Text></Pressable>)}
            </View>
            <ScrollView contentContainerStyle={styles.reviewList}>
              {reviewItems.length === 0 ? <View style={styles.emptyCard}><Text style={styles.sectionTitle}>{reviewScope === 'uncertain' ? 'Nic nečeká na ověření' : 'Tady není co kontrolovat'}</Text><Text style={styles.supporting}>Přepněte rozsah na „Vše“, chcete-li projít všechny zásoby.</Text></View> : null}
              {reviewGroups.map((group) => <View key={group.key} style={styles.reviewGroup}>
                {reviewScope !== 'location' ? <Text style={styles.reviewGroupTitle}>{group.name}</Text> : null}
                {group.items.map((item) => {
                  const isGone = reviewGone.has(item.id)
                  const left = reviewRemaining.get(item.id) ?? item.quantity
                  const changed = !isGone && left !== item.quantity
                  return <View key={item.id} style={[styles.reviewItem, isGone && styles.reviewItemGone]}>
                    <Pressable accessibilityLabel={`${item.name}: ${isGone ? 'došlo' : 'mám'}`} accessibilityRole="button" accessibilityState={{ selected: isGone }} disabled={reviewSaving} onPress={() => toggleReviewGone(item.id)} style={[styles.reviewItemToggle, reviewSaving && styles.disabled]}>
                      <View style={[styles.reviewStatus, isGone ? styles.reviewStatusGone : styles.reviewStatusKept]}>{isGone ? <X color={colors.destructive} size={14} /> : <Check color={colors.success} size={14} />}<Text style={[styles.reviewStatusText, isGone ? styles.reviewStatusGoneText : styles.reviewStatusKeptText]}>{isGone ? 'Došlo' : 'Mám'}</Text></View>
                      <View style={styles.reviewItemText}>
                        <Text numberOfLines={2} style={[styles.reviewItemName, isGone && styles.reviewItemNameGone]}>{item.name}</Text>
                        <Text style={styles.reviewItemNote}>{changed ? `bylo ${quantityLabel(item.quantity)} ${unitLabel(item.quantity, item.unit)}` : `${quantityLabel(item.quantity)} ${unitLabel(item.quantity, item.unit)}`}{item.estimateReason ? ` · Asi došlo, ${item.estimateReason}` : item.askedAt ? ' · Máte ještě?' : ''}</Text>
                      </View>
                    </Pressable>
                    {!isGone && item.contents.length === 0 ? <View style={styles.reviewStepper}>
                      <Pressable accessibilityLabel={`Méně: ${item.name}`} disabled={reviewSaving} onPress={() => changeReviewQuantity(item, -1)} style={[styles.reviewStepButton, reviewSaving && styles.disabled]}><Minus color={colors.secondaryText} size={16} /></Pressable>
                      <Text style={[styles.reviewAmount, changed && styles.reviewAmountChanged]}>{quantityLabel(left)} {unitLabel(left, item.unit)}</Text>
                      <Pressable accessibilityLabel={`Více: ${item.name}`} disabled={reviewSaving} onPress={() => changeReviewQuantity(item, 1)} style={[styles.reviewStepButton, reviewSaving && styles.disabled]}><Plus color={colors.secondaryText} size={16} /></Pressable>
                    </View> : null}
                    {!isGone && item.contents.length > 0 ? <Text style={styles.reviewItemNote}>Množství upravte po produktech v detailu zásoby.</Text> : null}
                  </View>
                })}
              </View>)}
            </ScrollView>
            {reviewedGoneIds.length > 0 ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: reviewAddToList }} disabled={reviewSaving} onPress={() => setReviewAddToList((value) => !value)} style={[styles.reviewListOption, reviewSaving && styles.disabled]}>
              <View style={[styles.reviewCheckbox, reviewAddToList && styles.reviewCheckboxSelected]}>{reviewAddToList ? <Check color={colors.primaryForeground} size={14} /> : null}</View>
              <Text style={styles.supporting}>Co došlo, přidat na nákupní seznam</Text>
            </Pressable> : null}
            {reviewError ? <Text accessibilityRole="alert" style={styles.error}>{reviewError}</Text> : null}
            <View style={styles.reviewFooter}>
              <Text style={styles.reviewSummary}>Došlo: {reviewedGoneIds.length} · Mám: {reviewedKeptIds.length}{reviewQuantities.length ? ` · upraveno: ${reviewQuantities.length}` : ''}</Text>
              <View style={styles.reviewActions}>
                <Pressable accessibilityRole="button" disabled={reviewSaving} onPress={() => setReviewScope(null)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Zrušit</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={reviewSaving || reviewItems.length === 0} onPress={() => void saveReview()} style={[styles.primaryButton, (reviewSaving || reviewItems.length === 0) && styles.disabled]}><Text style={styles.primaryButtonText}>{reviewSaving ? 'Ukládám…' : 'Uložit kontrolu'}</Text></Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
      <Modal animationType="slide" onRequestClose={() => !adding && setAddOpen(false)} transparent visible={addOpen}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.editor}>
              <View style={styles.editorHeading}><Text style={styles.editorTitle}>Přidat do zásob</Text><Pressable accessibilityLabel="Zavřít formulář" onPress={() => !adding && setAddOpen(false)} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable></View>
              <Text style={styles.formLabel}>Název položky</Text>
              <TextInput accessibilityLabel="Název položky" onChangeText={setNewName} placeholder="Např. rýže" style={styles.input} value={newName} />
              <Text style={styles.formLabel}>Kategorie</Text>
              <View style={styles.chipWrap}>{CATEGORIES.map((category) => <Pressable key={category} accessibilityRole="button" accessibilityState={{ selected: newCategory === category }} onPress={() => setNewCategory(category)} style={[styles.choiceChip, newCategory === category && styles.choiceChipActive]}><Text style={[styles.choiceText, newCategory === category && styles.choiceTextActive]}>{category}</Text></Pressable>)}</View>
              <Text style={styles.formLabel}>Množství a jednotka</Text>
              <TextInput accessibilityLabel="Množství položky" keyboardType="decimal-pad" onChangeText={setNewQuantity} style={styles.input} value={newQuantity} />
              <ScrollView horizontal contentContainerStyle={styles.horizontalChips} showsHorizontalScrollIndicator={false}>{ITEM_UNITS.map((unit) => <Pressable key={unit} accessibilityRole="button" accessibilityState={{ selected: newUnit === unit }} onPress={() => setNewUnit(unit)} style={[styles.choiceChip, newUnit === unit && styles.choiceChipActive]}><Text style={[styles.choiceText, newUnit === unit && styles.choiceTextActive]}>{unitLabel(1, unit)}</Text></Pressable>)}</ScrollView>
              <Text style={styles.supporting}>Umístění: {selected?.name ?? 'Spíž'}</Text>
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              <Pressable accessibilityRole="button" disabled={adding} onPress={() => void saveNewItem()} style={[styles.primaryButton, adding && styles.disabled]}><Text style={styles.primaryButtonText}>{adding ? 'Přidávám…' : 'Přidat položku'}</Text></Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  )
}

function useStyles() {
  const { colors } = useMobileTheme()
  return useMemo(() => StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  heading: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headingText: { flex: 1, minWidth: 0 },
  title: { color: colors.foreground, fontSize: 20, fontWeight: '700' },
  supporting: { color: colors.secondaryText, fontSize: 13, lineHeight: 19, marginTop: 4 },
  placeList: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  place: { minWidth: 105, borderColor: colors.inputBorder, borderRadius: 14, borderWidth: 1, backgroundColor: colors.card, paddingHorizontal: 13, paddingVertical: 11 },
  placeActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  placeName: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  placeNameActive: { color: colors.primaryForeground },
  placeCount: { color: colors.secondaryText, fontSize: 12, marginTop: 4 },
  sectionTitle: { color: colors.foreground, fontSize: 17, fontWeight: '700' },
  itemCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  itemHeading: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemHeadingText: { flex: 1, minWidth: 0, gap: 3 },
  itemName: { color: colors.foreground, fontSize: 16, fontWeight: '700' },
  itemCategory: { color: colors.mutedText, fontSize: 12 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  quantityButton: { width: 42, height: 42, borderColor: colors.inputBorder, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  quantityButtonText: { color: colors.primary, fontSize: 24, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  quantity: { color: colors.foreground, minWidth: 100, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  packageSize: { color: colors.secondaryText, fontSize: 13 },
  moveButton: { minHeight: 38, justifyContent: 'center', alignSelf: 'flex-start' },
  moveText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  destinationList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  destination: { minHeight: 40, borderColor: colors.inputBorder, borderRadius: 20, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 12 },
  destinationText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  emptyCard: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 22, gap: 4 },
  error: { color: colors.destructive, backgroundColor: colors.destructiveSubtle, borderRadius: 12, padding: 12, fontSize: 14, lineHeight: 20 },
  addButton: { backgroundColor: colors.accentSubtle, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9 },
  addButtonText: { color: colors.accentText, fontWeight: '700', fontSize: 13 },
  reviewOpenButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, borderRadius: 12, backgroundColor: colors.accentSubtle },
  reviewOpenText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
  removeButton: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  removeText: { color: colors.destructive, fontSize: 13, fontWeight: '600' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.navyOverlay },
  modalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  editor: { maxHeight: '92%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30, gap: 10 },
  editorHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  editorTitle: { color: colors.foreground, fontSize: 20, fontWeight: '800' },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted },
  closeText: { color: colors.foreground, fontSize: 26, lineHeight: 30 },
  formLabel: { color: colors.secondaryText, fontSize: 13, fontWeight: '600', marginTop: 2 },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.card, color: colors.foreground, paddingHorizontal: 12, fontSize: 15 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  horizontalChips: { flexDirection: 'row', gap: 7, paddingRight: 10 },
  choiceChip: { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 11, paddingVertical: 8 },
  choiceChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  choiceText: { color: colors.secondaryText, fontSize: 12, fontWeight: '600' },
  choiceTextActive: { color: colors.primaryForeground },
  primaryButton: { minHeight: 48, marginTop: 6, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12 },
  secondaryButtonText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  reviewBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.navyOverlay },
  reviewSheet: { maxHeight: '94%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 22, gap: 10 },
  reviewHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reviewHeadingText: { flex: 1, minWidth: 0 },
  reviewScopes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 4, borderRadius: 14, backgroundColor: colors.muted },
  reviewScope: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 11 },
  reviewScopeActive: { backgroundColor: colors.card },
  reviewScopeText: { color: colors.secondaryText, fontSize: 12, fontWeight: '600' },
  reviewScopeTextActive: { color: colors.foreground, fontWeight: '700' },
  reviewList: { gap: 8, paddingBottom: 8 },
  reviewGroup: { gap: 7 },
  reviewGroupTitle: { color: colors.mutedText, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  reviewItem: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, padding: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.card },
  reviewItemGone: { backgroundColor: colors.destructiveSubtle, borderColor: colors.destructive },
  reviewItemToggle: { flex: 1, minWidth: 180, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9 },
  reviewStatus: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, borderRadius: 15 },
  reviewStatusGone: { backgroundColor: colors.destructiveSubtle },
  reviewStatusKept: { backgroundColor: colors.accentSubtle },
  reviewStatusText: { fontSize: 11, fontWeight: '700' },
  reviewStatusGoneText: { color: colors.destructive },
  reviewStatusKeptText: { color: colors.success },
  reviewItemText: { flex: 1, minWidth: 0, gap: 2 },
  reviewItemName: { color: colors.foreground, fontSize: 13, fontWeight: '700' },
  reviewItemNameGone: { color: colors.mutedText, textDecorationLine: 'line-through' },
  reviewItemNote: { color: colors.mutedText, fontSize: 10, lineHeight: 14 },
  reviewStepper: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  reviewStepButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 10 },
  reviewAmount: { minWidth: 68, color: colors.secondaryText, fontSize: 11, textAlign: 'center' },
  reviewAmountChanged: { color: colors.accentText, fontWeight: '800' },
  reviewListOption: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 },
  reviewCheckbox: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 6 },
  reviewCheckboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  reviewFooter: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 8 },
  reviewSummary: { color: colors.secondaryText, fontSize: 11, fontWeight: '600' },
  reviewActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
}), [colors])
}
