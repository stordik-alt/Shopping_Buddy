import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { unitLabel } from '@anitka/shared/units'
import { MobileApiError, getPantry, updatePantryItem, type MobilePantryItem, type MobilePantryState } from '../lib/shopping-list-api'
import { RefreshButton } from './refresh-button'

const QUANTITY_STEP = { ks: 1, kg: 0.1, g: 10, l: 0.1, ml: 10, dávka: 1 } as const

function quantityLabel(value: number): string {
  return value.toLocaleString('cs-CZ', { maximumFractionDigits: 3 })
}

export function PantryScreen({ onAuthExpired }: { onAuthExpired: () => void }) {
  const [pantry, setPantry] = useState<MobilePantryState | null>(null)
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getPantry()
      setPantry(result)
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

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" style={styles.scroll}>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Text numberOfLines={1} style={styles.title}>Zásoby</Text>
          <Text style={styles.supporting}>Vyberte místo, kde jsou věci uložené.</Text>
        </View>
        <RefreshButton loading={loading} onPress={() => void load()} />
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

      {loading && !pantry ? (
        <View style={styles.empty}>
          <ActivityIndicator color="#087e8b" size="large" />
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
              <Text style={styles.itemName}>{item.name}</Text>
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
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  heading: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headingText: { flex: 1, minWidth: 0 },
  title: { color: '#122c3a', fontSize: 20, fontWeight: '700' },
  supporting: { color: '#526674', fontSize: 13, lineHeight: 19, marginTop: 4 },
  placeList: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  place: { minWidth: 105, borderColor: '#cbd8dd', borderRadius: 14, borderWidth: 1, backgroundColor: '#ffffff', paddingHorizontal: 13, paddingVertical: 11 },
  placeActive: { backgroundColor: '#087e8b', borderColor: '#087e8b' },
  placeName: { color: '#23515d', fontSize: 14, fontWeight: '700' },
  placeNameActive: { color: '#ffffff' },
  placeCount: { color: '#526674', fontSize: 12, marginTop: 4 },
  sectionTitle: { color: '#122c3a', fontSize: 17, fontWeight: '700' },
  itemCard: { backgroundColor: '#ffffff', borderColor: '#dce6e9', borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  itemName: { color: '#122c3a', fontSize: 16, fontWeight: '700' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  quantityButton: { width: 42, height: 42, borderColor: '#cbd8dd', borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  quantityButtonText: { color: '#23515d', fontSize: 24, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  quantity: { color: '#122c3a', minWidth: 100, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  packageSize: { color: '#526674', fontSize: 13 },
  moveButton: { minHeight: 38, justifyContent: 'center', alignSelf: 'flex-start' },
  moveText: { color: '#087e8b', fontSize: 14, fontWeight: '600' },
  destinationList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  destination: { minHeight: 40, borderColor: '#cbd8dd', borderRadius: 20, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 12 },
  destinationText: { color: '#23515d', fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  emptyCard: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#dce6e9', borderRadius: 16, borderWidth: 1, padding: 22, gap: 4 },
  error: { color: '#a72d2d', backgroundColor: '#fff0f0', borderRadius: 12, padding: 12, fontSize: 14, lineHeight: 20 },
})
