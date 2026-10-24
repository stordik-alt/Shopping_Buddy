import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { Camera, FileText, ImageUp } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMobileTheme } from '../lib/theme'
import {
  getPendingReceiptImports,
  getStoreChains,
  importManualReceipt,
  MobileApiError,
  processReceiptImport,
  uploadReceiptFile,
  type MobileReceiptImport,
} from '../lib/shopping-list-api'
import { RefreshButton } from './refresh-button'
import { NativeManualPurchaseForm } from './native-parity-screens'
import type { ManualPurchaseInput } from '../../../lib/types'
import type { MobileChainTile } from '../lib/shopping-list-api'

type Props = { onAuthExpired: () => void }

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

export function ReceiptsScreen({ onAuthExpired }: Props) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [receipts, setReceipts] = useState<MobileReceiptImport[]>([])
  const [completed, setCompleted] = useState<MobileReceiptImport | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [storeChains, setStoreChains] = useState<MobileChainTile[]>([])
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      if (result.receipt.status === 'completed') setCompleted(result.receipt)
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
                  <Pressable
                    accessibilityRole="button"
                    disabled={workingId !== null}
                    onPress={() => void runReceipt(item.id, retry)}
                    style={[styles.secondaryButton, workingId === item.id && styles.disabledButton]}
                  >
                    <Text style={styles.secondaryButtonText}>{workingId === item.id ? 'Zpracovávám…' : retry ? 'Zkusit znovu' : 'Spustit zpracování'}</Text>
                  </Pressable>
                ) : item.status === 'review_required' || item.status === 'duplicate_review' ? (
                  <Text style={styles.supporting}>Před uložením nákupu dokončete kontrolu v aplikaci ANITKA.</Text>
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
  receiptCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  receiptStatus: { color: colors.foreground, fontSize: 16, fontWeight: '700' },
  receiptLine: { color: colors.secondaryText, fontSize: 14 },
  emptyState: { alignItems: 'center', marginHorizontal: 16, padding: 20, backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
}), [colors])
}
