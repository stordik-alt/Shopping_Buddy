import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { Camera, Check, Copy, FileText, ImageUp, RotateCcw, Trash2, X } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMobileTheme } from '../lib/theme'
import {
  cancelReceiptImport,
  confirmReceiptListSuggestions,
  confirmReceiptReview,
  getPendingReceiptImports,
  getReceiptListSuggestions,
  getPantrySettings,
  getStoreChains,
  importManualReceipt,
  MobileApiError,
  processReceiptImport,
  receiptImageUrl,
  resolveDuplicateReceipt,
  uploadReceiptFile,
  type MobileReceiptImport,
} from '../lib/shopping-list-api'
import type { ReceiptListSuggestion } from '../../../lib/db/receipt-list'
import { RefreshButton } from './refresh-button'
import { NativeManualPurchaseForm } from './native-parity-screens'
import type { ManualPurchaseInput } from '../../../lib/types'
import type { MobileChainTile } from '../lib/shopping-list-api'
import { ITEM_UNITS, unitLabel, type ItemUnit } from '@anitka/shared/units'
import { PANTRY_LOCATIONS } from '../../../lib/pantry'
import { subcategoriesOfItem } from '../../../lib/product-subcategories'
import { PRODUCT_TYPES } from '../../../lib/product-types'
import { ocrProviderLabel } from '../../../lib/receipt-ocr-provider'
import type { ItemCategory, PantryLocation } from '../../../lib/types'
import { getAccessToken } from '../lib/auth'
import type { MobileReceiptLineItem } from '../lib/shopping-list-api'

const ITEM_CATEGORIES: ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']
const sortedProductTypes = [...PRODUCT_TYPES].sort((a, b) => a.name.localeCompare(b.name, 'cs'))

type Props = { onAuthExpired: () => void; onListItemsUpdated: (items: { id: string; done: boolean; quantity: number; unit: ItemUnit; price: number }[]) => void; focusedReceiptId?: string | null; onFocusHandled?: () => void }

function receiptStatusLabel(status: MobileReceiptImport['status']): string {
  switch (status) {
    case 'uploaded': return 'Čeká na zpracování'
    case 'ocr_processing':
    case 'ocr_completed':
    case 'parsing':
    case 'parsed':
    case 'validating': return 'Účtenka se zpracovává'
    case 'ocr_failed':
    case 'parsing_failed': return 'Zpracování se nezdařilo'
    case 'review_required': return 'Vyžaduje kontrolu'
    case 'duplicate_review': return 'Možná duplicita'
    default: return 'Stav účtenky'
  }
}

function ReceiptCameraModal({
  visible,
  busy,
  onCapture,
  onClose,
}: {
  visible: boolean
  busy: boolean
  onCapture: (uri: string) => void
  onClose: () => void
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [permission, requestPermission] = useCameraPermissions()
  const [cameraActive, setCameraActive] = useState(false)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const camera = useRef<CameraView>(null)
  const [capturing, setCapturing] = useState(false)

  useEffect(() => {
    if (!visible) {
      setCameraActive(false)
      setPermissionError(null)
    } else if (permission?.granted) {
      setCameraActive(true)
    }
  }, [permission?.granted, visible])

  async function enableCamera() {
    setPermissionError(null)
    try {
      const result = await requestPermission()
      if (result.granted) setCameraActive(true)
    } catch {
      setPermissionError('Přístup k fotoaparátu se nepodařilo ověřit.')
    }
  }

  async function capture() {
    if (busy || capturing || !camera.current) return
    setCapturing(true)
    setPermissionError(null)
    try {
      const picture = await camera.current.takePictureAsync({ quality: 0.82, exif: false })
      if (!picture?.uri) throw new Error('Fotografii se nepodařilo pořídit.')
      onCapture(picture.uri)
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : 'Fotografii se nepodařilo pořídit.')
    } finally {
      setCapturing(false)
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={busy ? () => undefined : onClose} presentationStyle="fullScreen" visible={visible}>
      <SafeAreaView style={styles.cameraScreen}>
        <View style={styles.cameraHeader}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Vyfotit účtenku</Text>
            <Text style={styles.supporting}>Vyfoťte celou účtenku rovně a bez odlesků.</Text>
          </View>
          <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Zavřít</Text>
          </Pressable>
        </View>
        {cameraActive ? (
          <View style={styles.cameraPreview}>
            <CameraView
              facing="back"
              onMountError={(event) => {
                setPermissionError(event.message)
                setCameraActive(false)
              }}
              ref={camera}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={styles.receiptFrame} />
            {permissionError ? <Text accessibilityRole="alert" style={styles.cameraError}>{permissionError}</Text> : null}
            {busy || capturing ? (
              <View style={styles.busyOverlay}>
                <ActivityIndicator color="#ffffff" size="large" />
                <Text style={styles.busyText}>{capturing ? 'Pořizuji fotografii…' : 'Zpracovávám účtenku…'}</Text>
              </View>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => void capture()} style={styles.captureButton}>
                <Text style={styles.captureButtonText}>Vyfotit</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.permissionState}>
            {permissionError ? <Text accessibilityRole="alert" style={styles.error}>{permissionError}</Text> : null}
            {permission && !permission.granted && !permission.canAskAgain ? (
              <Text style={styles.supporting}>Povolte ANITCE přístup k fotoaparátu v nastavení zařízení.</Text>
            ) : (
              <>
                <Text style={styles.supporting}>Fotoaparát se zapne až po vašem potvrzení.</Text>
                <Pressable accessibilityRole="button" onPress={() => void enableCamera()} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Povolit fotoaparát</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  )
}

function NativeReceiptReviewModal({ receipt, busy, onClose, onDone, onBusyChange, onAuthExpired }: {
  receipt: MobileReceiptImport
  busy: boolean
  onClose: () => void
  onDone: (status: 'completed' | 'cancelled', purchaseId?: string) => void
  onBusyChange: (busy: boolean) => void
  onAuthExpired: () => void
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const duplicate = receipt.status === 'duplicate_review'
  const [rows, setRows] = useState<MobileReceiptLineItem[]>(receipt.extracted?.items ?? [])
  const [date, setDate] = useState(receipt.extracted?.date ?? '')
  const [places, setPlaces] = useState<{ key: string; name: string; custom: boolean; id?: string }[]>(PANTRY_LOCATIONS.map((name) => ({ key: name, name, custom: false })))
  const [token, setToken] = useState<string | null>(null)
  const [sourceExpanded, setSourceExpanded] = useState(false)
  const [typeQueries, setTypeQueries] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getPantrySettings().then((result) => {
      if (active) setPlaces(result.placeOptions.map((place) => ({ key: place.key, name: place.name, custom: place.custom, id: place.id })))
    }).catch(() => undefined)
    getAccessToken().then((value) => { if (active) setToken(value) }).catch(() => undefined)
    return () => { active = false }
  }, [])

  function updateRow(index: number, changes: Partial<MobileReceiptLineItem>) {
    setRows((current) => current.map((row, position) => {
      if (position !== index) return row
      const next = { ...row, ...changes }
      if ('category' in changes || 'subcategory' in changes) next.classificationSource = 'manual'
      return next
    }))
  }

  async function finish(action: () => Promise<unknown>, status: 'completed' | 'cancelled') {
    onBusyChange(true)
    setError(null)
    try {
      const result = await action()
      const purchase = result && typeof result === 'object' && 'purchase' in result ? (result as { purchase?: { id?: unknown } }).purchase : undefined
      onDone(status, typeof purchase?.id === 'string' ? purchase.id : undefined)
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Kontrolu účtenky se nepodařilo uložit.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally { onBusyChange(false) }
  }

  const activeRows = rows.filter((row) => row.name.trim() && !row.removed)
  const missingPlaces = activeRows.filter((row) => !row.location && !row.customPlaceId).length
  const canSave = !busy && Boolean(date.trim()) && activeRows.length > 0 && (duplicate || missingPlaces === 0)

  function saveReview() {
    if (!canSave) return
    void finish(() => duplicate
      ? resolveDuplicateReceipt(receipt.id, 'save_new', rows, date)
      : confirmReceiptReview(receipt.id, rows, date), 'completed')
  }

  function selectPlace(index: number, key: string) {
    const place = places.find((entry) => entry.key === key)
    const customPlaceId = place?.custom ? (place.id ?? key.slice('custom:'.length)) : undefined
    updateRow(index, { location: customPlaceId ? undefined : key as PantryLocation, customPlaceId })
  }

  return <Modal animationType='slide' onRequestClose={busy ? () => undefined : onClose} presentationStyle='fullScreen' visible>
    <SafeAreaView style={styles.reviewScreen}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewHeaderText}><Text style={styles.title}>{duplicate ? 'Kontrola možné duplicity' : 'Zkontrolovat účtenku'}</Text><Text style={styles.supporting}>{receipt.extracted?.total != null ? 'Celkem ' + receipt.extracted.total.toLocaleString('cs-CZ') + ' Kč · ' : ''}{rows.length} položek</Text></View>
        <Pressable accessibilityLabel='Zavřít kontrolu účtenky' accessibilityRole='button' disabled={busy} onPress={onClose} style={styles.closeButton}><X color={colors.foreground} size={20} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.reviewContent} keyboardShouldPersistTaps='handled'>
        {receipt.hasImage && token ? <Image accessibilityLabel='Originál účtenky' source={{ uri: receiptImageUrl(receipt.id), headers: { Authorization: 'Bearer ' + token } }} style={styles.reviewSourceImage} resizeMode='contain' /> : null}
        {receipt.hasImage && !token ? <Text style={styles.noteText}>Originál účtenky se nepodařilo načíst.</Text> : null}
        {receipt.rawOcrText ? <>
          <Pressable accessibilityRole='button' accessibilityState={{ expanded: sourceExpanded }} onPress={() => setSourceExpanded((value) => !value)} style={styles.sourceToggle}><Text style={styles.secondaryButtonText}>{sourceExpanded ? 'Skrýt přečtený text OCR' : 'Zobrazit přečtený text OCR'}</Text></Pressable>
          {sourceExpanded ? <Text selectable style={styles.ocrText}>{receipt.rawOcrText}</Text> : null}
        </> : null}
        <View style={styles.reviewCard}>
          <Text style={styles.cardTitle}>{duplicate ? 'Vypadá to jako nákup, který už máte zaznamenaný' : 'Projít rozpoznané údaje'}</Text>
          <Text style={styles.noteText}>{receipt.ocrProvider ? 'OCR: ' + ocrProviderLabel(receipt.ocrProvider) + ' · ' : ''}{duplicate ? 'Rozhodněte, zda nákup uložit znovu.' : 'Opravte název, množství, cenu, zařazení a místo uložení.'}</Text>
          <Text style={styles.fieldLabel}>Datum nákupu</Text>
          <TextInput accessibilityLabel='Datum nákupu' autoCapitalize='none' onChangeText={setDate} placeholder='RRRR-MM-DD' placeholderTextColor={colors.mutedText} style={styles.reviewInput} value={date} />
        </View>
        {rows.map((row, index) => <View key={index} style={[styles.reviewCard, row.removed && styles.reviewCardRemoved]}>
          {row.removed ? <View style={styles.rowBetween}><Text style={styles.removedLine}>{row.name}</Text><Pressable accessibilityRole='button' onPress={() => updateRow(index, { removed: false })} style={styles.secondaryButton}><RotateCcw color={colors.accentText} size={15} /><Text style={styles.secondaryButtonText}>Obnovit</Text></Pressable></View> : <>
            <View style={styles.rowBetween}><Text style={styles.fieldLabel}>Položka {index + 1}</Text><Pressable accessibilityLabel={'Odebrat položku ' + row.name} accessibilityRole='button' onPress={() => updateRow(index, { removed: true })} style={styles.removeLine}><Trash2 color={colors.destructive} size={17} /></Pressable></View>
            {duplicate ? <Text style={styles.reviewLineName}>{row.name}</Text> : <TextInput accessibilityLabel={'Název položky ' + (index + 1)} onChangeText={(name) => updateRow(index, { name })} placeholderTextColor={colors.mutedText} style={styles.reviewInput} value={row.name} />}
            {row.productSuggestions?.length ? <>
              <Text style={styles.fieldLabel}>Produkt</Text>
              <ScrollView horizontal contentContainerStyle={styles.reviewChips} showsHorizontalScrollIndicator={false}>
                <Pressable accessibilityRole='radio' accessibilityState={{ checked: !row.productId }} onPress={() => updateRow(index, { productId: null })} style={[styles.reviewChip, !row.productId && styles.reviewChipActive]}><Text style={[styles.reviewChipText, !row.productId && styles.reviewChipTextActive]}>Bez vazby</Text></Pressable>
                {row.productSuggestions.map((suggestion) => <Pressable key={suggestion.productId} accessibilityRole='radio' accessibilityState={{ checked: row.productId === suggestion.productId }} onPress={() => updateRow(index, { productId: suggestion.productId, productTypeKey: suggestion.productTypeKey ?? null, productTypeSelectionChanged: false })} style={[styles.reviewChip, row.productId === suggestion.productId && styles.reviewChipActive]}><Text style={[styles.reviewChipText, row.productId === suggestion.productId && styles.reviewChipTextActive]}>{suggestion.name}</Text></Pressable>)}
              </ScrollView>
            </> : null}
            {!row.nonInventory ? <>
              <Text style={styles.fieldLabel}>Druh produktu</Text>
              <TextInput accessibilityLabel={'Hledat druh produktu ' + (index + 1)} onChangeText={(value) => setTypeQueries((current) => ({ ...current, [index]: value }))} placeholder='Vyhledat druh…' placeholderTextColor={colors.mutedText} style={styles.reviewInput} value={typeQueries[index] ?? ''} />
              <ScrollView horizontal contentContainerStyle={styles.reviewChips} showsHorizontalScrollIndicator={false}>
                {[
                  { key: '', name: 'Neurčeno' },
                  ...(row.typeSuggestions ?? []),
                  ...sortedProductTypes.filter((type) => !typeQueries[index] || type.name.toLocaleLowerCase('cs').includes(typeQueries[index].toLocaleLowerCase('cs'))).slice(0, 16),
                ].filter((type, choiceIndex, all) => all.findIndex((entry) => entry.key === type.key) === choiceIndex).map((type) => <Pressable key={type.key || 'unset'} accessibilityRole='radio' accessibilityState={{ checked: (row.productTypeKey ?? '') === type.key }} onPress={() => updateRow(index, { productTypeKey: type.key || null, productTypeSelectionChanged: true })} style={[styles.reviewChip, (row.productTypeKey ?? '') === type.key && styles.reviewChipActive]}><Text style={[styles.reviewChipText, (row.productTypeKey ?? '') === type.key && styles.reviewChipTextActive]}>{type.name}</Text></Pressable>)}
              </ScrollView>
            </> : <Text style={styles.noteText}>Nebude v zásobách</Text>}
            {!duplicate ? <>
              <View style={styles.reviewFields}>
                <View style={styles.reviewField}><Text style={styles.fieldLabel}>Množství</Text><TextInput accessibilityLabel={'Množství položky ' + (index + 1)} keyboardType='decimal-pad' onChangeText={(value) => updateRow(index, { quantity: Math.max(0.001, Number(value.replace(',', '.')) || 0.001) })} style={styles.reviewInput} value={String(row.quantity)} /></View>
                <View style={styles.reviewField}><Text style={styles.fieldLabel}>Cena</Text><TextInput accessibilityLabel={'Cena položky ' + (index + 1)} keyboardType='decimal-pad' onChangeText={(value) => updateRow(index, { price: Math.max(0, Number(value.replace(',', '.')) || 0) })} style={styles.reviewInput} value={String(row.price)} /></View>
                {row.discount != null ? <View style={styles.reviewField}><Text style={styles.fieldLabel}>Sleva</Text><TextInput accessibilityLabel={'Sleva položky ' + (index + 1)} keyboardType='decimal-pad' onChangeText={(value) => updateRow(index, { discount: Math.max(0, Number(value.replace(',', '.')) || 0) })} style={styles.reviewInput} value={String(row.discount)} /></View> : null}
              </View>
              <Text style={styles.fieldLabel}>Jednotka</Text><ScrollView horizontal contentContainerStyle={styles.reviewChips} showsHorizontalScrollIndicator={false}>{ITEM_UNITS.map((unit) => <Pressable key={unit} accessibilityRole='radio' accessibilityState={{ checked: row.unit === unit }} onPress={() => updateRow(index, { unit: unit as ItemUnit })} style={[styles.reviewChip, row.unit === unit && styles.reviewChipActive]}><Text style={[styles.reviewChipText, row.unit === unit && styles.reviewChipTextActive]}>{unitLabel(1, unit)}</Text></Pressable>)}</ScrollView>
              <Text style={styles.fieldLabel}>Kategorie</Text><ScrollView horizontal contentContainerStyle={styles.reviewChips} showsHorizontalScrollIndicator={false}>{ITEM_CATEGORIES.map((category) => <Pressable key={category} accessibilityRole='radio' accessibilityState={{ checked: row.category === category }} onPress={() => updateRow(index, { category, subcategory: undefined })} style={[styles.reviewChip, row.category === category && styles.reviewChipActive]}><Text style={[styles.reviewChipText, row.category === category && styles.reviewChipTextActive]}>{category}</Text></Pressable>)}</ScrollView>
            </> : null}
            {duplicate ? <><Text style={styles.fieldLabel}>Kategorie</Text><ScrollView horizontal contentContainerStyle={styles.reviewChips} showsHorizontalScrollIndicator={false}>{ITEM_CATEGORIES.map((category) => <Pressable key={category} accessibilityRole='radio' accessibilityState={{ checked: row.category === category }} onPress={() => updateRow(index, { category, subcategory: undefined })} style={[styles.reviewChip, row.category === category && styles.reviewChipActive]}><Text style={[styles.reviewChipText, row.category === category && styles.reviewChipTextActive]}>{category}</Text></Pressable>)}</ScrollView></> : null}
            <Text style={styles.fieldLabel}>Podkategorie</Text>
            <ScrollView horizontal contentContainerStyle={styles.reviewChips} showsHorizontalScrollIndicator={false}>
              <Pressable accessibilityRole='radio' accessibilityState={{ checked: !row.subcategory }} onPress={() => updateRow(index, { subcategory: undefined })} style={[styles.reviewChip, !row.subcategory && styles.reviewChipActive]}><Text style={[styles.reviewChipText, !row.subcategory && styles.reviewChipTextActive]}>Bez podkategorie</Text></Pressable>
              {subcategoriesOfItem(row.category).map((subcategory) => <Pressable key={subcategory} accessibilityRole='radio' accessibilityState={{ checked: row.subcategory === subcategory }} onPress={() => updateRow(index, { subcategory })} style={[styles.reviewChip, row.subcategory === subcategory && styles.reviewChipActive]}><Text style={[styles.reviewChipText, row.subcategory === subcategory && styles.reviewChipTextActive]}>{subcategory}</Text></Pressable>)}
            </ScrollView>
            {!duplicate ? <>
              <Text style={styles.fieldLabel}>Místo uložení</Text>
              <ScrollView horizontal contentContainerStyle={styles.reviewChips} showsHorizontalScrollIndicator={false}>{places.map((place) => {
                const selected = place.custom ? row.customPlaceId === place.id : row.location === place.key && !row.customPlaceId
                return <Pressable key={place.key} accessibilityRole='radio' accessibilityState={{ checked: selected }} onPress={() => selectPlace(index, place.key)} style={[styles.reviewChip, selected && styles.reviewChipActive]}><Text style={[styles.reviewChipText, selected && styles.reviewChipTextActive]}>{place.name}</Text></Pressable>
              })}</ScrollView>
            </> : null}
          </>}
        </View>)}
        {!duplicate && missingPlaces > 0 ? <Text accessibilityRole='alert' style={styles.reviewError}>Vyberte místo uložení u {missingPlaces} položek.</Text> : null}
        {error ? <Text accessibilityRole='alert' style={styles.reviewError}>{error}</Text> : null}
        <View style={styles.reviewActions}>
          {duplicate ? <>
            <Pressable accessibilityRole='button' disabled={busy} onPress={() => void finish(() => resolveDuplicateReceipt(receipt.id, 'use_existing'), 'cancelled')} style={styles.secondaryButton}><Copy color={colors.accentText} size={16} /><Text style={styles.secondaryButtonText}>Je to duplicita, nepřidávat</Text></Pressable>
            <Pressable accessibilityRole='button' disabled={!canSave} onPress={saveReview} style={[styles.primaryButton, !canSave && styles.disabledButton]}><Check color={colors.primaryForeground} size={17} /><Text style={styles.primaryButtonText}>{busy ? 'Ukládám…' : 'Přesto uložit nový nákup'}</Text></Pressable>
            <Pressable accessibilityRole='button' disabled={busy} onPress={() => void finish(() => resolveDuplicateReceipt(receipt.id, 'cancel'), 'cancelled')} style={styles.textAction}><Text style={styles.textActionText}>Zahodit účtenku</Text></Pressable>
          </> : <>
            <Pressable accessibilityRole='button' disabled={!canSave} onPress={saveReview} style={[styles.primaryButton, !canSave && styles.disabledButton]}><Check color={colors.primaryForeground} size={17} /><Text style={styles.primaryButtonText}>{busy ? 'Ukládám…' : 'Potvrdit a uložit nákup'}</Text></Pressable>
            <Pressable accessibilityRole='button' disabled={busy} onPress={() => Alert.alert('Zahodit účtenku?', 'Rozpoznané položky a nahraný soubor se odstraní.', [{ text: 'Zpět', style: 'cancel' }, { text: 'Zahodit', style: 'destructive', onPress: () => void finish(() => cancelReceiptImport(receipt.id), 'cancelled') }])} style={styles.textAction}><Text style={styles.textActionText}>Zahodit účtenku</Text></Pressable>
          </>}
        </View>
      </ScrollView>
    </SafeAreaView>
  </Modal>
}

function ReceiptListSuggestionsModal({ purchaseId, suggestions, onClose, onConfirm }: {
  purchaseId: string
  suggestions: ReceiptListSuggestion[]
  onClose: () => void
  onConfirm: (purchaseId: string, pairs: { listItemId: string; purchaseItemId: string }[]) => Promise<void>
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [selected, setSelected] = useState<Set<string>>(() => new Set(suggestions.map((item) => item.listItemId)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <Modal animationType="slide" onRequestClose={() => !busy && onClose()} transparent visible>
    <View style={styles.modalBackdrop}>
      <View style={styles.suggestionSheet}>
        <View style={styles.reviewHeader}><View style={styles.headerText}><Text style={styles.title}>Odškrtnout nákupní seznam?</Text><Text style={styles.supporting}>Zkontrolujte návrhy. Vybrané položky dostanou cenu a množství z účtenky.</Text></View><Pressable accessibilityLabel="Zavřít návrhy shod" disabled={busy} onPress={onClose} style={styles.closeButton}><X color={colors.foreground} size={20} /></Pressable></View>
        <ScrollView contentContainerStyle={styles.suggestionList}>
          {suggestions.map((suggestion) => {
            const checked = selected.has(suggestion.listItemId)
            return <Pressable key={suggestion.listItemId} accessibilityRole="checkbox" accessibilityState={{ checked }} disabled={busy} onPress={() => setSelected((current) => { const next = new Set(current); if (checked) next.delete(suggestion.listItemId); else next.add(suggestion.listItemId); return next })} style={styles.suggestionRow}>
              <Text style={[styles.ingredientCheck, checked && styles.ingredientCheckSelected]}>{checked ? '✓' : '○'}</Text>
              <View style={styles.headerText}><Text style={styles.receiptLine}>{suggestion.listItemName}</Text><Text style={styles.supporting}>Účtenka: {suggestion.receiptName} · {suggestion.quantity} {suggestion.unit} · {suggestion.price.toLocaleString('cs-CZ')} Kč/{suggestion.unit}</Text></View>
            </Pressable>
          })}
        </ScrollView>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <View style={styles.receiptActions}>
          <Pressable accessibilityRole="button" disabled={busy || selected.size === 0} onPress={() => { setBusy(true); setError(''); void onConfirm(purchaseId, suggestions.filter((item) => selected.has(item.listItemId)).map(({ listItemId, purchaseItemId }) => ({ listItemId, purchaseItemId }))).then(onClose).catch((caught) => setError(caught instanceof Error ? caught.message : 'Položky se nepodařilo uložit.')).finally(() => setBusy(false)) }} style={[styles.primaryButton, (busy || selected.size === 0) && styles.disabledButton]}><Text style={styles.primaryButtonText}>{busy ? 'Ukládám…' : `Odškrtnout (${selected.size})`}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Ponechat na seznamu</Text></Pressable>
        </View>
      </View>
    </View>
  </Modal>
}

export function ReceiptsScreen({ onAuthExpired, onListItemsUpdated, focusedReceiptId, onFocusHandled }: Props) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [receipts, setReceipts] = useState<MobileReceiptImport[]>([])
  const [completed, setCompleted] = useState<MobileReceiptImport | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [storeChains, setStoreChains] = useState<MobileChainTile[]>([])
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<MobileReceiptImport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [listSuggestions, setListSuggestions] = useState<{ purchaseId: string; suggestions: ReceiptListSuggestion[] } | null>(null)

  async function offerListMatches(purchaseId: string | null | undefined) {
    if (!purchaseId) return
    try {
      const result = await getReceiptListSuggestions(purchaseId)
      if (result.suggestions.length) setListSuggestions({ purchaseId, suggestions: result.suggestions })
    } catch (caught) {
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
      setError(caught instanceof Error ? caught.message : 'Návrhy shod se seznamem se nepodařilo načíst.')
    }
  }

  async function confirmListMatches(purchaseId: string, pairs: { listItemId: string; purchaseItemId: string }[]) {
    const result = await confirmReceiptListSuggestions(purchaseId, pairs)
    onListItemsUpdated(result.tickedListItems)
  }

  async function refresh() {
    setError(null)
    setLoading(true)
    try {
      const result = await getPendingReceiptImports()
      setReceipts(result.receipts)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Účtenky se nepodařilo načíst.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (!focusedReceiptId || loading) return
    const target = receipts.find((receipt) => receipt.id === focusedReceiptId)
    if (target) setReviewing(target)
    onFocusHandled?.()
  }, [focusedReceiptId, loading, onFocusHandled, receipts])

  useEffect(() => {
    let active = true
    getStoreChains().then(({ chains }) => { if (active) setStoreChains(chains) }).catch(() => undefined)
    return () => { active = false }
  }, [])

  function replaceReceipt(receipt: MobileReceiptImport) {
    if (['imported', 'discarded', 'completed', 'cancelled'].includes(receipt.status)) {
      setReceipts((current) => current.filter((item) => item.id !== receipt.id))
      return
    }
    setReceipts((current) => [receipt, ...current.filter((item) => item.id !== receipt.id)])
  }

  async function runReceipt(receiptId: string, retry: boolean) {
    setWorkingId(receiptId)
    setError(null)
    try {
      const result = await processReceiptImport(receiptId, retry)
      replaceReceipt(result.receipt)
      if (result.receipt.status === 'completed') { setCompleted(result.receipt); await offerListMatches(result.receipt.purchaseId) }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Účtenku se nepodařilo zpracovat.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
      await refresh()
    } finally {
      setWorkingId(null)
    }
  }

  async function handleUpload(uri: string, name: string, mimeType: string) {
    setWorkingId('upload')
    setError(null)
    try {
      const result = await uploadReceiptFile(uri, name, mimeType)
      replaceReceipt(result.receipt)
      setCameraOpen(false)
      await runReceipt(result.receipt.id, false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Fotografii účtenky se nepodařilo nahrát.')
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
    } finally {
      setWorkingId(null)
    }
  }

  async function choosePhoto() {
    setError(null)
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.85, exif: false })
      if (result.canceled || !result.assets[0]) return
      const asset = result.assets[0]
      const extension = asset.fileName?.split('.').pop()?.toLowerCase()
      const mimeType = asset.mimeType ?? (extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : extension === 'heic' || extension === 'heif' ? 'image/heic' : 'image/jpeg')
      await handleUpload(asset.uri, asset.fileName ?? `receipt.${mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : mimeType === 'image/heic' ? 'heic' : 'jpg'}`, mimeType)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Galerii se nepodařilo otevřít.')
    }
  }

  async function chooseDocument() {
    setError(null)
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
        multiple: false,
      })
      if (result.canceled || !result.assets[0]) return
      const file = result.assets[0]
      const extension = file.name.split('.').pop()?.toLowerCase()
      const mimeType = file.mimeType ?? (extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg')
      if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        setError('Nepodporovaný formát. Vyberte JPEG, PNG, WEBP nebo PDF.')
        return
      }
      await handleUpload(file.uri, file.name, mimeType)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Soubor se nepodařilo otevřít.')
    }
  }

  async function saveManualReceipt(input: ManualPurchaseInput) {
    try {
      const result = await importManualReceipt(input)
      setCompleted(result.receipt)
      setManualOpen(false)
      await offerListMatches(result.purchase.id)
    } catch (caught) {
      if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired()
      throw caught
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.actionCard}>
        <Text style={styles.sectionTitle}>Import účtenky</Text>
        <Text style={styles.supporting}>Vyfoťte nebo vyberte účtenku. Nákup se po zpracování uloží do historie, rozpočtu i zásob domácnosti.</Text>
        <View style={styles.importActions}>
          <Pressable accessibilityRole="button" disabled={workingId !== null} onPress={() => setCameraOpen(true)} style={[styles.primaryButton, styles.importAction, workingId !== null && styles.disabledButton]}>
            <Camera color={colors.primaryForeground} size={18} /><Text style={styles.primaryButtonText}>Vyfotit</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={workingId !== null} onPress={() => void choosePhoto()} style={[styles.secondaryButton, styles.importAction, workingId !== null && styles.disabledButton]}>
            <ImageUp color={colors.accentText} size={18} /><Text style={styles.secondaryButtonText}>Z galerie</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={workingId !== null} onPress={() => void chooseDocument()} style={[styles.secondaryButton, styles.importAction, workingId !== null && styles.disabledButton]}>
            <FileText color={colors.accentText} size={18} /><Text style={styles.secondaryButtonText}>Fotka / PDF</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={workingId !== null} onPress={() => setManualOpen(true)} style={[styles.secondaryButton, styles.importAction, workingId !== null && styles.disabledButton]}>
            <Text style={styles.secondaryButtonText}>Zadat ručně</Text>
          </Pressable>
        </View>
        <Text style={styles.supporting}>Podporujeme JPEG, PNG, WEBP a PDF. Ruční zadání zůstává dostupné i bez OCR.</Text>
      </View>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {completed ? (
        <View accessibilityLiveRegion="polite" style={styles.successCard}>
          <Text style={styles.successTitle}>Účtenka byla importována</Text>
          <Text style={styles.supporting}>Nákup byl přidán do historie domácnosti.</Text>
        </View>
      ) : null}

      <View style={styles.listHeader}>
        <Text numberOfLines={1} style={[styles.sectionTitle, styles.listHeaderTitle]}>Rozpracované účtenky</Text>
        <RefreshButton disabled={workingId !== null} loading={loading} onPress={() => void refresh()} variant="outlined" />
      </View>
      {loading && receipts.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : receipts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.supporting}>Žádná účtenka nečeká na zpracování nebo kontrolu.</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={receipts}
          keyExtractor={(receipt) => receipt.id}
          renderItem={({ item }) => {
            const canRetry = item.status === 'uploaded' || item.status === 'ocr_failed' || item.status === 'parsing_failed' || item.stalled
            const retry = item.status !== 'uploaded'
            return (
              <View style={styles.receiptCard}>
                <Text style={styles.receiptStatus}>{receiptStatusLabel(item.status)}</Text>
                {item.extracted ? (
                  <Text style={styles.supporting}>
                    {item.extracted.date ?? 'Datum nerozpoznáno'} · {item.extracted.total == null ? 'Celková částka nerozpoznána' : `${item.extracted.total} Kč`}
                  </Text>
                ) : null}
                {item.extracted?.items.slice(0, 3).map((line, index) => (
                  <Text key={`${item.id}-${index}`} style={styles.receiptLine} numberOfLines={1}>
                    {line.quantity} {line.unit} · {line.name}
                  </Text>
                ))}
                {item.errorMessage ? <Text style={styles.errorText}>{item.errorMessage}</Text> : null}
                {canRetry ? (
                  <View style={styles.receiptActions}>
                    <Pressable accessibilityRole="button" disabled={workingId !== null} onPress={() => void runReceipt(item.id, retry)} style={[styles.secondaryButton, workingId === item.id && styles.disabledButton]}>
                      <Text style={styles.secondaryButtonText}>{workingId === item.id ? 'Zpracovávám…' : retry ? 'Zkusit znovu' : 'Spustit zpracování'}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={workingId !== null} onPress={() => Alert.alert('Zahodit účtenku?', 'Nahraný soubor se odstraní.', [{ text: 'Zpět', style: 'cancel' }, { text: 'Zahodit', style: 'destructive', onPress: () => void (async () => { setWorkingId(item.id); try { await cancelReceiptImport(item.id); replaceReceipt({ ...item, status: 'cancelled' }) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Účtenku se nepodařilo zahodit.'); if (caught instanceof MobileApiError && caught.status === 401) onAuthExpired() } finally { setWorkingId(null) } })() }])} style={styles.textAction}><Text style={styles.textActionText}>Zahodit</Text></Pressable>
                  </View>
                ) : item.status === 'review_required' || item.status === 'duplicate_review' ? (
                  <Pressable accessibilityRole="button" disabled={workingId !== null} onPress={() => setReviewing(item)} style={styles.primaryButton}>
                    {item.status === 'duplicate_review' ? <Copy color={colors.primaryForeground} size={16} /> : <Check color={colors.primaryForeground} size={16} />}
                    <Text style={styles.primaryButtonText}>{item.status === 'duplicate_review' ? 'Rozhodnout o duplicitě' : 'Zkontrolovat položky'}</Text>
                  </Pressable>
                ) : null}
              </View>
            )
          }}
        />
      )}

      <ReceiptCameraModal
        busy={workingId !== null}
        onCapture={(uri) => void handleUpload(uri, 'receipt.jpg', 'image/jpeg')}
        onClose={() => setCameraOpen(false)}
        visible={cameraOpen}
      />
      {manualOpen ? <NativeManualPurchaseForm chains={storeChains} onClose={() => setManualOpen(false)} onSave={saveManualReceipt} /> : null}
      {reviewing ? <NativeReceiptReviewModal
        key={reviewing.id}
        receipt={reviewing}
        busy={workingId === reviewing.id}
        onAuthExpired={onAuthExpired}
        onBusyChange={(value) => setWorkingId(value ? reviewing.id : null)}
        onClose={() => setReviewing(null)}
        onDone={(status, purchaseId) => { replaceReceipt({ ...reviewing, status }); setReviewing(null); if (status === 'completed') { setCompleted({ ...reviewing, status }); void offerListMatches(purchaseId) } }}
      /> : null}
      {listSuggestions ? <ReceiptListSuggestionsModal key={listSuggestions.purchaseId} purchaseId={listSuggestions.purchaseId} suggestions={listSuggestions.suggestions} onClose={() => setListSuggestions(null)} onConfirm={confirmListMatches} /> : null}
    </View>
  )
}

function useStyles() {
  const { colors } = useMobileTheme()
  return useMemo(() => StyleSheet.create({
  screen: { flex: 1, gap: 12 },
  cameraScreen: { flex: 1, backgroundColor: colors.background },
  cameraHeader: { minHeight: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, gap: 12 },
  headerText: { flex: 1 },
  title: { color: colors.foreground, fontSize: 20, fontWeight: '700' },
  supporting: { color: colors.secondaryText, fontSize: 14, lineHeight: 20, marginTop: 5 },
  actionCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, margin: 16, padding: 16, gap: 12 },
  importActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  importAction: { flexDirection: 'row', flexGrow: 1, gap: 8, justifyContent: 'center', minWidth: '44%' },
  sectionTitle: { color: colors.foreground, fontSize: 18, fontWeight: '700' },
  primaryButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: colors.primary, paddingHorizontal: 18, marginTop: 8 },
  primaryButtonText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' },
  secondaryButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderColor: colors.inputBorder, borderRadius: 12, borderWidth: 1, backgroundColor: colors.card, paddingHorizontal: 12 },
  secondaryButtonText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  disabledButton: { opacity: 0.55 },
  cameraPreview: { flex: 1, overflow: 'hidden', backgroundColor: colors.foreground, margin: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  receiptFrame: { width: '78%', height: '72%', borderColor: '#ffffff', borderWidth: 2, borderRadius: 12 },
  cameraError: { position: 'absolute', top: 16, left: 16, right: 16, color: colors.primaryForeground, backgroundColor: colors.destructive, borderRadius: 10, padding: 10, textAlign: 'center' },
  captureButton: { position: 'absolute', bottom: 28, minHeight: 52, minWidth: 160, justifyContent: 'center', alignItems: 'center', borderRadius: 26, backgroundColor: colors.card, paddingHorizontal: 24 },
  captureButtonText: { color: colors.accentText, fontSize: 16, fontWeight: '700' },
  busyOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.navyOverlay },
  busyText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '600' },
  permissionState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  error: { color: colors.destructive, backgroundColor: colors.destructiveSubtle, borderRadius: 12, marginHorizontal: 16, marginBottom: 8, padding: 12, fontSize: 14, lineHeight: 20 },
  errorText: { color: colors.destructive, fontSize: 14, lineHeight: 20 },
  successCard: { backgroundColor: colors.accentSubtle, borderColor: colors.accent, borderWidth: 1, borderRadius: 16, marginHorizontal: 16, padding: 14, gap: 4 },
  successTitle: { color: colors.success, fontSize: 16, fontWeight: '700' },
  listHeader: { minHeight: 52, marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  listHeaderTitle: { flex: 1, minWidth: 0 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  receiptActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.navyOverlay },
  suggestionSheet: { maxHeight: '82%', gap: 12, padding: 16, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.background },
  suggestionList: { gap: 6, paddingBottom: 8 },
  suggestionRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: colors.card },
  ingredientCheck: { width: 24, color: colors.mutedText, fontSize: 20, textAlign: 'center' },
  ingredientCheckSelected: { color: colors.accentText, fontWeight: '800' },
  receiptCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  receiptStatus: { color: colors.foreground, fontSize: 16, fontWeight: '700' },
  receiptLine: { color: colors.secondaryText, fontSize: 14 },
  reviewScreen: { flex: 1, backgroundColor: colors.background },
  reviewHeader: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  reviewHeaderText: { flex: 1 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.muted },
  reviewContent: { gap: 10, padding: 14, paddingBottom: 30 },
  reviewCard: { gap: 8, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  reviewCardRemoved: { opacity: 0.7, backgroundColor: colors.muted },
  cardTitle: { color: colors.foreground, fontSize: 15, fontWeight: '700' },
  noteText: { color: colors.mutedText, fontSize: 12, lineHeight: 17 },
  fieldLabel: { color: colors.secondaryText, fontSize: 12, fontWeight: '700' },
  reviewInput: { minHeight: 42, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 10, backgroundColor: colors.elevated, color: colors.foreground, paddingHorizontal: 10, fontSize: 14 },
  reviewFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reviewField: { flexGrow: 1, flexBasis: '28%', gap: 5 },
  reviewChips: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  reviewChip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 17, backgroundColor: colors.elevated },
  reviewChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSubtle },
  reviewChipText: { color: colors.secondaryText, fontSize: 11, fontWeight: '600' },
  reviewChipTextActive: { color: colors.accentText },
  reviewSourceImage: { width: '100%', height: 220, borderRadius: 14, backgroundColor: colors.muted },
  sourceToggle: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card },
  ocrText: { maxHeight: 180, padding: 11, borderRadius: 12, backgroundColor: colors.muted, color: colors.secondaryText, fontSize: 12, lineHeight: 18 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  reviewLineName: { color: colors.foreground, fontSize: 14, fontWeight: '600' },
  removedLine: { flex: 1, color: colors.mutedText, fontSize: 13, textDecorationLine: 'line-through' },
  removeLine: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.destructiveSubtle },
  reviewError: { padding: 10, borderRadius: 11, backgroundColor: colors.destructiveSubtle, color: colors.destructive, fontSize: 13, lineHeight: 18 },
  reviewActions: { gap: 8, paddingTop: 4 },
  textAction: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  textActionText: { color: colors.destructive, fontSize: 13, fontWeight: '700' },
  emptyState: { alignItems: 'center', marginHorizontal: 16, padding: 20, backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
}), [colors])
}
