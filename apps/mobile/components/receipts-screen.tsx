import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  getPendingReceiptImports,
  MobileApiError,
  processReceiptImport,
  uploadReceiptPhoto,
  type MobileReceiptImport,
} from '../lib/shopping-list-api'

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
  const [receipts, setReceipts] = useState<MobileReceiptImport[]>([])
  const [completed, setCompleted] = useState<MobileReceiptImport | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
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

  function replaceReceipt(receipt: MobileReceiptImport) {
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

  async function handleCapture(uri: string) {
    setWorkingId('upload')
    setError(null)
    try {
      const result = await uploadReceiptPhoto(uri)
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

  return (
    <View style={styles.screen}>
      <View style={styles.actionCard}>
        <Text style={styles.sectionTitle}>Import účtenky</Text>
        <Text style={styles.supporting}>Fotografie se bezpečně uloží a zpracuje stejným OCR postupem jako v aplikaci ANITKA.</Text>
        <Pressable accessibilityRole="button" disabled={workingId !== null} onPress={() => setCameraOpen(true)} style={[styles.primaryButton, workingId !== null && styles.disabledButton]}>
          <Text style={styles.primaryButtonText}>{workingId === 'upload' ? 'Nahrávám…' : 'Vyfotit účtenku'}</Text>
        </Pressable>
      </View>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {completed ? (
        <View accessibilityLiveRegion="polite" style={styles.successCard}>
          <Text style={styles.successTitle}>Účtenka byla importována</Text>
          <Text style={styles.supporting}>Nákup byl přidán do historie domácnosti.</Text>
        </View>
      ) : null}

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>Rozpracované účtenky</Text>
        <Pressable accessibilityRole="button" disabled={loading || workingId !== null} onPress={() => void refresh()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{loading ? 'Načítám…' : 'Obnovit'}</Text>
        </Pressable>
      </View>
      {loading && receipts.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#087e8b" size="large" />
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
        onCapture={(uri) => void handleCapture(uri)}
        onClose={() => setCameraOpen(false)}
        visible={cameraOpen}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 12 },
  cameraScreen: { flex: 1, backgroundColor: '#f3f7f8' },
  cameraHeader: { minHeight: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, gap: 12 },
  headerText: { flex: 1 },
  title: { color: '#122c3a', fontSize: 20, fontWeight: '700' },
  supporting: { color: '#526674', fontSize: 14, lineHeight: 20, marginTop: 5 },
  actionCard: { backgroundColor: '#ffffff', borderColor: '#dce6e9', borderRadius: 18, borderWidth: 1, margin: 16, padding: 16, gap: 12 },
  sectionTitle: { color: '#122c3a', fontSize: 18, fontWeight: '700' },
  primaryButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#087e8b', paddingHorizontal: 18, marginTop: 8 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  secondaryButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderColor: '#cbd8dd', borderRadius: 12, borderWidth: 1, backgroundColor: '#ffffff', paddingHorizontal: 12 },
  secondaryButtonText: { color: '#23515d', fontSize: 14, fontWeight: '600' },
  disabledButton: { opacity: 0.55 },
  cameraPreview: { flex: 1, overflow: 'hidden', backgroundColor: '#122c3a', margin: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  receiptFrame: { width: '78%', height: '72%', borderColor: '#ffffff', borderWidth: 2, borderRadius: 12 },
  captureButton: { position: 'absolute', bottom: 28, minHeight: 52, minWidth: 160, justifyContent: 'center', alignItems: 'center', borderRadius: 26, backgroundColor: '#ffffff', paddingHorizontal: 24 },
  captureButtonText: { color: '#075e68', fontSize: 16, fontWeight: '700' },
  busyOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#122c3acc' },
  busyText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  permissionState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  error: { color: '#a72d2d', backgroundColor: '#fff0f0', borderRadius: 12, marginHorizontal: 16, marginBottom: 8, padding: 12, fontSize: 14, lineHeight: 20 },
  errorText: { color: '#a72d2d', fontSize: 14, lineHeight: 20 },
  successCard: { backgroundColor: '#e9f7ee', borderColor: '#b9e3c7', borderWidth: 1, borderRadius: 16, marginHorizontal: 16, padding: 14, gap: 4 },
  successTitle: { color: '#17623b', fontSize: 16, fontWeight: '700' },
  listHeader: { minHeight: 52, marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  receiptCard: { backgroundColor: '#ffffff', borderColor: '#dce6e9', borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  receiptStatus: { color: '#122c3a', fontSize: 16, fontWeight: '700' },
  receiptLine: { color: '#526674', fontSize: 14 },
  emptyState: { alignItems: 'center', marginHorizontal: 16, padding: 20, backgroundColor: '#ffffff', borderColor: '#dce6e9', borderRadius: 18, borderWidth: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
})
