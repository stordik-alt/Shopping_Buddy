import { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import type { BarcodeScanningResult } from 'expo-camera'
import { SafeAreaView } from 'react-native-safe-area-context'

type Props = {
  visible: boolean
  busy: boolean
  onBarcodeScanned: (barcode: string) => void
  onClose: () => void
}

export function BarcodeScannerModal({ visible, busy, onBarcodeScanned, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const [cameraActive, setCameraActive] = useState(false)
  const [scanHandled, setScanHandled] = useState(false)
  const [permissionError, setPermissionError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) {
      setCameraActive(false)
      setScanHandled(false)
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

  function handleBarcode(result: BarcodeScanningResult) {
    if (busy || scanHandled || !['ean8', 'ean13', 'upc_a'].includes(result.type)) return
    setScanHandled(true)
    onBarcodeScanned(result.data)
  }

  return (
    <Modal animationType="slide" onRequestClose={busy ? () => undefined : onClose} presentationStyle="fullScreen" visible={visible}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Skenovat čárový kód</Text>
            <Text style={styles.supporting}>Namiřte kameru na EAN nebo UPC kód produktu.</Text>
          </View>
          <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>Zavřít</Text>
          </Pressable>
        </View>
        {cameraActive ? (
          <View style={styles.preview}>
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ['ean8', 'ean13', 'upc_a'] }}
              facing="back"
              onBarcodeScanned={!busy && !scanHandled ? handleBarcode : undefined}
              onMountError={(event) => {
                setPermissionError(event.message)
                setCameraActive(false)
              }}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={styles.scanFrame} />
            {busy ? (
              <View style={styles.busyOverlay}>
                <ActivityIndicator color="#ffffff" size="large" />
                <Text style={styles.busyText}>Vyhledávám produkt…</Text>
              </View>
            ) : (
              <Text style={styles.hint}>Kód umístěte do rámečku</Text>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f7f8' },
  header: { minHeight: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, gap: 12 },
  headerText: { flex: 1 },
  title: { color: '#122c3a', fontSize: 20, fontWeight: '700' },
  supporting: { color: '#526674', fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: 'center' },
  closeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  closeText: { color: '#23515d', fontSize: 14, fontWeight: '600' },
  preview: { flex: 1, overflow: 'hidden', backgroundColor: '#122c3a', margin: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: '82%', height: 150, borderColor: '#ffffff', borderWidth: 3, borderRadius: 14 },
  hint: { color: '#ffffff', backgroundColor: '#122c3acc', fontSize: 14, marginTop: 24, paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden', borderRadius: 12 },
  busyOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#122c3acc' },
  busyText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  permissionState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  primaryButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#087e8b', paddingHorizontal: 18, marginTop: 8 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  error: { color: '#a72d2d', fontSize: 14, textAlign: 'center' },
})
