import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ITEM_UNITS, unitLabel, type ItemUnit } from '@anitka/shared/units'
import { BudgetScreen } from '../components/budget-screen'
import { PantryScreen } from '../components/pantry-screen'
import { RecipesScreen } from '../components/recipes-screen'
import { MealPlanScreen } from '../components/meal-plan-screen'
import { BarcodeScannerModal } from '../components/barcode-scanner-modal'
import { ReceiptsScreen } from '../components/receipts-screen'
import { RefreshButton } from '../components/refresh-button'
import { getAccessToken, signIn, signOut } from '../lib/auth'
import {
  applyOfflineOperations,
  createOfflineItemId,
  enqueueOfflineOperation,
  syncOfflineOperations,
  type OfflineContext,
  type OfflineShoppingSnapshot,
} from '../lib/offline-shopping-list'
import {
  clearLastOfflineContext,
  readLastOfflineContext,
  readOfflineSnapshot,
  saveLastOfflineContext,
  saveOfflineSnapshot,
} from '../lib/offline-shopping-storage'
import {
  addShoppingItem,
  getCurrentUser,
  getShoppingList,
  lookupBarcode,
  MobileApiError,
  toggleShoppingItem,
  updateShoppingItem,
  type MobileShoppingItem,
} from '../lib/shopping-list-api'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Operaci se nepodařilo dokončit. Zkuste to znovu.'
}

function LoginForm({ onSignIn, busy, error }: { onSignIn: (email: string, password: string) => void; busy: boolean; error: string | null }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <View style={styles.centered}>
      <View style={styles.card}>
        <Text style={styles.brand}>ANITKA</Text>
        <Text style={styles.title}>Přihlášení</Text>
        <Text style={styles.supporting}>Přihlaste se ke svému účtu a otevřete nákupní seznam domácnosti.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TextInput
          accessibilityLabel="E-mail"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="E-mail"
          placeholderTextColor="#64748b"
          style={styles.input}
          value={email}
        />
        <TextInput
          accessibilityLabel="Heslo"
          autoComplete="password"
          onChangeText={setPassword}
          onSubmitEditing={() => onSignIn(email.trim(), password)}
          placeholder="Heslo"
          placeholderTextColor="#64748b"
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <PrimaryButton disabled={busy || !email.trim() || !password} label="Přihlásit se" onPress={() => onSignIn(email.trim(), password)} />
      </View>
    </View>
  )
}

function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primaryButton, disabled && styles.disabledButton]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  )
}

function ShoppingRow({
  item,
  busy,
  disabled,
  onToggle,
  onEdit,
}: {
  item: MobileShoppingItem
  busy: boolean
  disabled: boolean
  onToggle: () => void
  onEdit: () => void
}) {
  return (
    <View style={styles.itemRow}>
      <Pressable
        accessibilityLabel={item.done ? `Označit ${item.name} jako nenakoupené` : `Označit ${item.name} jako nakoupené`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done, disabled: disabled || busy }}
        disabled={disabled || busy}
        onPress={onToggle}
        style={[styles.checkbox, item.done && styles.checkboxDone]}
      >
        {busy ? <ActivityIndicator color="#ffffff" size="small" /> : item.done ? <Text style={styles.checkmark}>✓</Text> : null}
      </Pressable>
      <View style={styles.itemText}>
        <Text style={[styles.itemName, item.done && styles.itemDone]}>{item.name}</Text>
        <Text style={styles.itemQuantity}>
          {item.quantity} {unitLabel(item.quantity, item.unit)}
        </Text>
        {item.pending ? <Text style={styles.pendingLabel}>Čeká na synchronizaci</Text> : null}
      </View>
      <Pressable accessibilityLabel={`Upravit množství položky ${item.name}`} accessibilityRole="button" disabled={disabled} onPress={onEdit} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Upravit</Text>
      </Pressable>
    </View>
  )
}

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<'shopping' | 'budget' | 'pantry' | 'recipes' | 'meals' | 'receipts'>('shopping')
  const [signedIn, setSignedIn] = useState(false)
  const [busy, setBusy] = useState(true)
  const [signingIn, setSigningIn] = useState(false)
  const [userName, setUserName] = useState('')
  const [householdAvailable, setHouseholdAvailable] = useState(false)
  const [householdMissing, setHouseholdMissing] = useState(false)
  const [items, setItems] = useState<MobileShoppingItem[]>([])
  const [listName, setListName] = useState('Nákupní seznam')
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const [editItem, setEditItem] = useState<MobileShoppingItem | null>(null)
  const [editQuantity, setEditQuantity] = useState('')
  const [editUnit, setEditUnit] = useState<ItemUnit>('ks')
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false)
  const [barcodeBusy, setBarcodeBusy] = useState(false)
  const [pendingChanges, setPendingChanges] = useState(0)
  const [offline, setOffline] = useState(false)
  const barcodeHandled = useRef(false)
  const offlineSnapshot = useRef<OfflineShoppingSnapshot | null>(null)

  function showSnapshot(snapshot: OfflineShoppingSnapshot) {
    offlineSnapshot.current = snapshot
    setPendingChanges(snapshot.pending.length)
    setItems(applyOfflineOperations(snapshot.list.items, snapshot.pending))
    setListName(snapshot.list.shoppingLists[0] ?? 'Nákupní seznam')
  }

  async function syncPendingChanges(refreshAfterSync = false) {
    const current = offlineSnapshot.current
    if (!current || current.pending.length === 0) return

    const result = await syncOfflineOperations(
      current,
      { add: addShoppingItem, toggle: toggleShoppingItem, update: updateShoppingItem },
      saveOfflineSnapshot,
    )
    showSnapshot(result.snapshot)
    setOffline(result.retryRequired)
    if (result.error instanceof MobileApiError && result.error.status === 401) {
      setSignedIn(false)
      setHouseholdAvailable(false)
      await clearLastOfflineContext()
      setError('Přihlášení vypršelo. Přihlaste se znovu; změny čekají na synchronizaci.')
      return
    }
    if (result.rejected > 0) {
      const count = result.rejected
      const countLabel = count === 1 ? '1 změnu' : `${count} ${count <= 4 ? 'změny' : 'změn'}`
      setError(
        result.rejected === result.rejectedNotFound
          ? `${countLabel} se nepodařilo uložit, protože polož${count === 1 ? 'ka už není dostupná' : 'ky už nejsou dostupné'}. Seznam můžete znovu načíst.`
          : 'Server některé změny odmítl. Zkontrolujte seznam a zadejte je znovu.',
      )
    }

    if (refreshAfterSync && !result.retryRequired && result.snapshot.pending.length === 0) {
      try {
        const list = await getShoppingList()
        const updated = { ...result.snapshot, list }
        await saveOfflineSnapshot(updated)
        showSnapshot(updated)
      } catch (caught) {
        if (caught instanceof MobileApiError && caught.status !== 0 && caught.status < 500) throw caught
        setOffline(true)
      }
    }
  }

  const handleAuthExpired = useCallback(() => {
    setSignedIn(false)
    setError('Přihlášení vypršelo. Přihlaste se znovu.')
    void clearLastOfflineContext()
  }, [])

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    setHouseholdMissing(false)
    setOffline(false)
    try {
      const token = await getAccessToken()
      if (!token) {
        setSignedIn(false)
        setHouseholdAvailable(false)
        setItems([])
        setPendingChanges(0)
        setOffline(false)
        offlineSnapshot.current = null
        await clearLastOfflineContext()
        return
      }
      setSignedIn(true)
      let profile
      try {
        profile = await getCurrentUser()
      } catch (caught) {
        if (!(caught instanceof MobileApiError) || (caught.status !== 0 && caught.status < 500)) throw caught
        const context = await readLastOfflineContext()
        const cached = context ? await readOfflineSnapshot(context.userId, context.householdId) : null
        if (!context || !cached) throw caught
        showSnapshot(cached)
        setUserName(context.userName)
        setHouseholdMissing(false)
        setHouseholdAvailable(true)
        setOffline(true)
        return
      }
      setUserName(profile.user.name)
      if (!profile.household) {
        setHouseholdMissing(true)
        setHouseholdAvailable(false)
        setItems([])
        setPendingChanges(0)
        setOffline(false)
        offlineSnapshot.current = null
        await clearLastOfflineContext()
        return
      }
      const context: OfflineContext = {
        userId: profile.user.id,
        householdId: profile.household.id,
        userName: profile.user.name,
      }
      if (
        offlineSnapshot.current &&
        (offlineSnapshot.current.userId !== context.userId ||
          offlineSnapshot.current.householdId !== context.householdId)
      ) {
        offlineSnapshot.current = null
        setItems([])
        setPendingChanges(0)
      }
      await saveLastOfflineContext(context)
      let cached = await readOfflineSnapshot(context.userId, context.householdId)
      if (cached) showSnapshot(cached)
      if (cached?.pending.length) await syncPendingChanges()
      cached = offlineSnapshot.current ?? cached

      try {
        const list = await getShoppingList()
        cached = cached
          ? { ...cached, list }
          : {
              version: 1,
              userId: context.userId,
              householdId: context.householdId,
              list,
              pending: [],
            }
        await saveOfflineSnapshot(cached)
        showSnapshot(cached)
        setOffline(cached.pending.length > 0)
      } catch (caught) {
        if (caught instanceof MobileApiError && caught.status !== 0 && caught.status < 500) throw caught
        if (!cached) {
          setHouseholdAvailable(false)
          setOffline(false)
          setError('Seznam se nepodařilo načíst a offline kopie ještě není k dispozici. Připojte se a zkuste to znovu.')
          return
        }
        setOffline(true)
      }
      setHouseholdMissing(false)
      setHouseholdAvailable(true)
    } catch (caught) {
      setError(errorMessage(caught))
      if (caught instanceof MobileApiError && caught.status === 401) setSignedIn(false)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSignIn(email: string, password: string) {
    setSigningIn(true)
    setError(null)
    try {
      await clearLastOfflineContext()
      await signIn(email, password)
      await load()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSigningIn(false)
    }
  }

  async function handleSignOut() {
    setBusy(true)
    try {
      await signOut()
      await clearLastOfflineContext()
      setSignedIn(false)
      setHouseholdAvailable(false)
      setHouseholdMissing(false)
      setItems([])
      setPendingChanges(0)
      setOffline(false)
      offlineSnapshot.current = null
      setUserName('')
      setActiveTab('shopping')
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      await clearLastOfflineContext()
      setSignedIn(false)
      setHouseholdAvailable(false)
      setHouseholdMissing(false)
      setItems([])
      setPendingChanges(0)
      setOffline(false)
      offlineSnapshot.current = null
      setUserName('')
      setBusy(false)
    }
  }

  async function handleAdd() {
    const name = newName.trim()
    if (!name || busy || busyItemId) return
    setBusyItemId('new')
    setError(null)
    try {
      const current = offlineSnapshot.current
      if (!current) throw new Error('Seznam není připravený. Zkuste ho obnovit.')
      const itemId = createOfflineItemId()
      const updated = {
        ...current,
        pending: enqueueOfflineOperation(current.pending, {
          kind: 'add',
          item: { id: itemId, name, quantity: 1, unit: 'ks', done: false },
        }),
      }
      await saveOfflineSnapshot(updated)
      showSnapshot(updated)
      setNewName('')
      await syncPendingChanges(true)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusyItemId(null)
    }
  }

  async function handleBarcodeScanned(barcode: string) {
    if (barcodeHandled.current || busy || busyItemId) return
    barcodeHandled.current = true
    setBarcodeBusy(true)
    setError(null)
    try {
      const product = await lookupBarcode(barcode)
      setBarcodeScannerOpen(false)
      const current = offlineSnapshot.current
      if (!current) throw new Error('Seznam není připravený. Zkuste ho obnovit.')
      const updated = {
        ...current,
        pending: enqueueOfflineOperation(current.pending, {
          kind: 'add',
          item: { id: createOfflineItemId(), name: product.name, quantity: 1, unit: 'ks', done: false },
        }),
      }
      await saveOfflineSnapshot(updated)
      showSnapshot(updated)
      await syncPendingChanges(true)
    } catch (caught) {
      setError(errorMessage(caught))
      setBarcodeScannerOpen(false)
    } finally {
      barcodeHandled.current = false
      setBarcodeBusy(false)
    }
  }

  async function handleToggle(item: MobileShoppingItem) {
    if (busy || busyItemId) return
    setBusyItemId(item.id)
    setError(null)
    try {
      const current = offlineSnapshot.current
      if (!current) throw new Error('Seznam není připravený. Zkuste ho obnovit.')
      const updated = {
        ...current,
        pending: enqueueOfflineOperation(current.pending, {
          kind: 'toggle',
          itemId: item.id,
          done: !item.done,
        }),
      }
      await saveOfflineSnapshot(updated)
      showSnapshot(updated)
      await syncPendingChanges(true)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusyItemId(null)
    }
  }

  function openEdit(item: MobileShoppingItem) {
    setEditItem(item)
    setEditQuantity(String(item.quantity))
    setEditUnit(item.unit)
  }

  async function saveEdit() {
    if (!editItem || busy || busyItemId) return
    const quantity = Number(editQuantity.trim().replace(',', '.'))
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity >= 10_000_000) {
      setError('Množství musí být kladné číslo.')
      return
    }
    setBusyItemId(editItem.id)
    setError(null)
    try {
      const current = offlineSnapshot.current
      if (!current) throw new Error('Seznam není připravený. Zkuste ho obnovit.')
      const updated = {
        ...current,
        pending: enqueueOfflineOperation(current.pending, {
          kind: 'update',
          itemId: editItem.id,
          changes: { quantity, unit: editUnit },
        }),
      }
      await saveOfflineSnapshot(updated)
      showSnapshot(updated)
      setEditItem(null)
      await syncPendingChanges(true)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusyItemId(null)
    }
  }

  const remaining = items.filter((item) => !item.done).length
  const completed = items.length - remaining

  if (busy && !signedIn) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator color="#087e8b" size="large" />
          <Text style={styles.supporting}>Načítání účtu…</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <LoginForm onSignIn={handleSignIn} busy={signingIn} error={error} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>ANITKA</Text>
            <Text style={styles.title}>
              {householdAvailable
                ? activeTab === 'budget' ? 'Rozpočet' : activeTab === 'pantry' ? 'Zásoby' : activeTab === 'recipes' ? 'Recepty' : activeTab === 'receipts' ? 'Účtenky' : listName
                : 'Nákupní seznam'}
            </Text>
            {userName ? <Text style={styles.supporting}>Přihlášeno: {userName}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" disabled={busy || busyItemId !== null} onPress={handleSignOut} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Odhlásit</Text>
          </Pressable>
        </View>

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {offline || pendingChanges > 0 ? (
          <View style={styles.offlineNotice}>
            <Text style={styles.offlineNoticeText}>
              {pendingChanges > 0
                ? `${pendingChanges} změn čeká na synchronizaci.`
                : 'Zobrazuje se uložená kopie seznamu.'}
            </Text>
            <Pressable accessibilityRole="button" disabled={busy || busyItemId !== null} onPress={() => void load()} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{busy ? 'Synchronizuji…' : 'Synchronizovat / obnovit'}</Text>
            </Pressable>
          </View>
        ) : null}

        {!householdAvailable ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{householdMissing ? 'Domácnost není dostupná' : 'Seznam se nepodařilo načíst'}</Text>
            <Text style={styles.supporting}>
              {householdMissing
                ? 'Účet zatím není připojený k domácnosti. Připojte se k domácnosti a zkuste seznam obnovit.'
                : 'Zkontrolujte připojení a zkuste seznam načíst znovu.'}
            </Text>
            <PrimaryButton label="Obnovit" onPress={() => void load()} disabled={busy} />
          </View>
        ) : (
          <>
            {activeTab === 'shopping' ? (
              <>
                <View style={styles.summary}>
                  <Text style={styles.summaryText}>{remaining} k nákupu · {completed} hotovo</Text>
                  <RefreshButton disabled={busyItemId !== null} loading={busy} onPress={() => void load()} />
                </View>

                <View style={styles.addRow}>
                  <TextInput
                    accessibilityLabel="Nová položka"
                    editable={!busy && !busyItemId}
                    maxLength={300}
                    onChangeText={setNewName}
                    onSubmitEditing={() => void handleAdd()}
                    placeholder="Co koupit?"
                    placeholderTextColor="#64748b"
                    returnKeyType="done"
                    style={[styles.input, styles.addInput]}
                    value={newName}
                  />
                  <PrimaryButton label={busyItemId === 'new' ? 'Ukládám…' : 'Přidat'} onPress={() => void handleAdd()} disabled={!newName.trim() || busy || busyItemId !== null} />
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || busyItemId !== null}
                  onPress={() => {
                    setError(null)
                    setBarcodeScannerOpen(true)
                  }}
                  style={[styles.scanButton, busyItemId !== null && styles.disabledButton]}
                >
                  <Text style={styles.scanButtonText}>Skenovat čárový kód</Text>
                </Pressable>

                {editItem ? (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Upravit: {editItem.name}</Text>
                    <TextInput
                      accessibilityLabel="Množství"
                      keyboardType="decimal-pad"
                      onChangeText={setEditQuantity}
                      style={styles.input}
                      value={editQuantity}
                    />
                    <View style={styles.units}>
                      {ITEM_UNITS.map((unit) => (
                        <Pressable
                          accessibilityRole="radio"
                          accessibilityState={{ checked: editUnit === unit }}
                          key={unit}
                          onPress={() => setEditUnit(unit)}
                          style={[styles.unitButton, editUnit === unit && styles.unitSelected]}
                        >
                          <Text style={[styles.unitText, editUnit === unit && styles.unitTextSelected]}>{unit}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={styles.actions}>
                      <Pressable accessibilityRole="button" onPress={() => setEditItem(null)} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Zrušit</Text>
                      </Pressable>
                      <PrimaryButton label={busyItemId === editItem.id ? 'Ukládám…' : 'Uložit'} onPress={() => void saveEdit()} disabled={busyItemId !== null} />
                    </View>
                  </View>
                ) : null}

                {busy && items.length === 0 ? (
                  <View style={styles.centered}>
                    <ActivityIndicator color="#087e8b" size="large" />
                    <Text style={styles.supporting}>Načítání seznamu…</Text>
                  </View>
                ) : items.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.sectionTitle}>Seznam je zatím prázdný</Text>
                    <Text style={styles.supporting}>Přidejte první položku, kterou potřebujete nakoupit.</Text>
                  </View>
                ) : (
                  <FlatList
                    contentContainerStyle={styles.list}
                    data={items}
                    keyExtractor={(item) => item.id}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <ShoppingRow item={item} busy={busyItemId === item.id} disabled={busy || busyItemId !== null} onEdit={() => openEdit(item)} onToggle={() => void handleToggle(item)} />
                    )}
                  />
                )}
              </>
            ) : activeTab === 'budget' ? (
              <BudgetScreen onAuthExpired={handleAuthExpired} />
            ) : activeTab === 'pantry' ? (
              <PantryScreen onAuthExpired={handleAuthExpired} />
            ) : activeTab === 'meals' ? (
              <MealPlanScreen onAuthExpired={handleAuthExpired} />
            ) : activeTab === 'receipts' ? (
              <ReceiptsScreen onAuthExpired={handleAuthExpired} />
            ) : (
              <RecipesScreen onAuthExpired={handleAuthExpired} />
            )}
            <View accessibilityRole="tablist" style={styles.tabBar}>
              <Pressable accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'shopping' }} onPress={() => setActiveTab('shopping')} style={[styles.tab, activeTab === 'shopping' && styles.tabActive]}>
                <Text style={[styles.tabText, activeTab === 'shopping' && styles.tabTextActive]}>Seznam</Text>
              </Pressable>
              <Pressable accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'budget' }} onPress={() => setActiveTab('budget')} style={[styles.tab, activeTab === 'budget' && styles.tabActive]}>
                <Text style={[styles.tabText, activeTab === 'budget' && styles.tabTextActive]}>Rozpočet</Text>
              </Pressable>
              <Pressable accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'pantry' }} onPress={() => setActiveTab('pantry')} style={[styles.tab, activeTab === 'pantry' && styles.tabActive]}>
                <Text style={[styles.tabText, activeTab === 'pantry' && styles.tabTextActive]}>Zásoby</Text>
              </Pressable>
              <Pressable accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'recipes' }} onPress={() => setActiveTab('recipes')} style={[styles.tab, activeTab === 'recipes' && styles.tabActive]}>
                <Text style={[styles.tabText, activeTab === 'recipes' && styles.tabTextActive]}>Recepty</Text>
              </Pressable>
              <Pressable accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'meals' }} onPress={() => setActiveTab('meals')} style={[styles.tab, activeTab === 'meals' && styles.tabActive]}>
                <Text style={[styles.tabText, activeTab === 'meals' && styles.tabTextActive]}>Plán</Text>
              </Pressable>
              <Pressable accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'receipts' }} onPress={() => setActiveTab('receipts')} style={[styles.tab, activeTab === 'receipts' && styles.tabActive]}>
                <Text style={[styles.tabText, activeTab === 'receipts' && styles.tabTextActive]}>Účtenky</Text>
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
      <BarcodeScannerModal
        busy={barcodeBusy}
        onBarcodeScanned={(barcode) => void handleBarcodeScanned(barcode)}
        onClose={() => setBarcodeScannerOpen(false)}
        visible={barcodeScannerOpen}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f7f8' },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, gap: 12 },
  brand: { color: '#087e8b', fontSize: 14, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: '#122c3a', fontSize: 24, fontWeight: '700', marginTop: 4 },
  supporting: { color: '#526674', fontSize: 14, lineHeight: 20, marginTop: 5 },
  card: { backgroundColor: '#ffffff', borderColor: '#dce6e9', borderRadius: 18, borderWidth: 1, margin: 16, padding: 16, gap: 12 },
  sectionTitle: { color: '#122c3a', fontSize: 18, fontWeight: '700' },
  input: { minHeight: 48, borderColor: '#cbd8dd', borderRadius: 12, borderWidth: 1, backgroundColor: '#ffffff', color: '#122c3a', paddingHorizontal: 14, fontSize: 16 },
  primaryButton: { minHeight: 48, minWidth: 80, borderRadius: 12, backgroundColor: '#087e8b', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  disabledButton: { opacity: 0.55 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  secondaryButton: { minHeight: 44, borderColor: '#cbd8dd', borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryButtonText: { color: '#23515d', fontSize: 14, fontWeight: '600' },
  error: { color: '#a72d2d', backgroundColor: '#fff0f0', borderRadius: 12, marginHorizontal: 16, marginBottom: 8, padding: 12, fontSize: 14, lineHeight: 20 },
  offlineNotice: { flexDirection: 'column', alignItems: 'stretch', gap: 8, backgroundColor: '#fff7e6', borderColor: '#f0d9a8', borderRadius: 12, borderWidth: 1, marginHorizontal: 16, marginBottom: 8, padding: 10 },
  offlineNoticeText: { flex: 1, color: '#684b17', fontSize: 13, lineHeight: 18 },
  pendingLabel: { color: '#8a631c', fontSize: 12, marginTop: 4 },
  summary: { minHeight: 52, marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryText: { color: '#526674', fontSize: 14, fontWeight: '600' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  scanButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginBottom: 12, borderColor: '#cbd8dd', borderRadius: 12, borderWidth: 1, backgroundColor: '#ffffff' },
  scanButtonText: { color: '#23515d', fontSize: 14, fontWeight: '600' },
  addInput: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  itemRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#dce6e9', borderRadius: 16, borderWidth: 1, padding: 12, gap: 12 },
  checkbox: { width: 44, height: 44, borderColor: '#9aabb2', borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: '#087e8b', borderColor: '#087e8b' },
  checkmark: { color: '#ffffff', fontSize: 22, fontWeight: '700' },
  itemText: { flex: 1, minWidth: 0 },
  itemName: { color: '#122c3a', fontSize: 16, fontWeight: '600' },
  itemDone: { color: '#6a7d86', textDecorationLine: 'line-through' },
  itemQuantity: { color: '#526674', fontSize: 13, marginTop: 4 },
  emptyState: { alignItems: 'center', justifyContent: 'center', margin: 16, padding: 28, backgroundColor: '#ffffff', borderColor: '#dce6e9', borderRadius: 18, borderWidth: 1, gap: 8 },
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unitButton: { minHeight: 44, minWidth: 48, borderColor: '#cbd8dd', borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  unitSelected: { backgroundColor: '#dff4f5', borderColor: '#087e8b' },
  unitText: { color: '#526674', fontSize: 14, fontWeight: '600' },
  unitTextSelected: { color: '#075e68' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  tabBar: { flexDirection: 'row', borderTopColor: '#dce6e9', borderTopWidth: 1, backgroundColor: '#ffffff', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4, gap: 6 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  tabActive: { backgroundColor: '#dff4f5' },
  tabText: { color: '#526674', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#075e68' },
})
