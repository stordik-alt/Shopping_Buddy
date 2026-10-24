import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type StyleProp,
  type ViewStyle,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Notifications from 'expo-notifications'
import { Bell, ChevronDown } from 'lucide-react-native'
import { ITEM_UNITS, unitLabel, type ItemUnit } from '@anitka/shared/units'
import { useMobileTheme } from '../lib/theme'
import { unregisterDevicePushForSignOut } from '../lib/push-notifications'
import { BudgetScreen } from '../components/budget-screen'
import { PantryScreen } from '../components/pantry-screen'
import { RecipesScreen } from '../components/recipes-screen'
import { MealPlanScreen } from '../components/meal-plan-screen'
import { BarcodeScannerModal } from '../components/barcode-scanner-modal'
import { ReceiptsScreen } from '../components/receipts-screen'
import {
  NativeAssistantModal,
  NativeBottomNav,
  NativeDealsScreen,
  NativeHomeScreen,
  NativeNotificationsModal,
  NativeProfileScreen,
  NativePurchasesScreen,
  NativeStoresScreen,
  type NativeTab,
} from '../components/native-parity-screens'
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
  getNotifications,
  getShoppingList,
  lookupBarcode,
  MobileApiError,
  toggleShoppingItem,
  updateShoppingItem,
  type MobileShoppingItem,
  type MobileHouseholdProfileData,
} from '../lib/shopping-list-api'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Operaci se nepodařilo dokončit. Zkuste to znovu.'
}

function LoginForm({ onSignIn, busy, error }: { onSignIn: (email: string, password: string) => void; busy: boolean; error: string | null }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <View style={styles.centered}>
      <View style={styles.loginContent}>
        <View style={styles.loginBrand}>
          <Image accessibilityLabel="ANITKA" resizeMode="contain" source={require('../assets/anitka-logo.png')} style={styles.loginLogo} />
          <Text style={styles.poweredBy}>Powered by ANITKA AI</Text>
        </View>
        <View style={[styles.card, styles.loginCard]}>
          <Text style={styles.loginTitle}>Přihlásit se</Text>
          <Text style={styles.supporting}>Vítejte zpátky. Pojďme uhlídat rozpočet.</Text>
          {error ? <Text accessibilityRole="alert" style={[styles.error, styles.loginError]}>{error}</Text> : null}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              accessibilityLabel="E-mail"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder=""
              placeholderTextColor={colors.mutedText}
              returnKeyType="next"
              style={styles.input}
              value={email}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Heslo</Text>
            <TextInput
              accessibilityLabel="Heslo"
              autoComplete="current-password"
              onChangeText={setPassword}
              onSubmitEditing={() => onSignIn(email.trim(), password)}
              placeholder=""
              placeholderTextColor={colors.mutedText}
              returnKeyType="go"
              secureTextEntry
              style={styles.input}
              value={password}
            />
          </View>
          <PrimaryButton
            disabled={busy || !email.trim() || !password}
            label={busy ? 'Přihlašuji…' : 'Přihlásit se'}
            onPress={() => onSignIn(email.trim(), password)}
            style={styles.loginButton}
          />
          <Text style={styles.loginFooter}>
            Ještě nemáte účet?{' '}
            <Text accessibilityRole="link" onPress={() => void Linking.openURL('https://mojeanitka.cz/auth/sign-up')} style={styles.loginLink}>
              Založte si ho
            </Text>
          </Text>
        </View>
      </View>
    </View>
  )
}

function PrimaryButton({ label, onPress, disabled = false, style }: { label: string; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles()
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primaryButton, style, disabled && styles.disabledButton]}>
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
  const { colors } = useMobileTheme()
  const styles = useStyles()
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
        {busy ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : item.done ? <Text style={styles.checkmark}>✓</Text> : null}
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
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [activeTab, setActiveTab] = useState<NativeTab>('home')
  const [shoppingView, setShoppingView] = useState<'list' | 'purchases' | 'receipts'>('list')
  const [recipeView, setRecipeView] = useState<'recipes' | 'meals'>('recipes')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const [quickExpenseToken, setQuickExpenseToken] = useState(0)
  const [signedIn, setSignedIn] = useState(false)
  const [busy, setBusy] = useState(true)
  const [signingIn, setSigningIn] = useState(false)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [householdRole, setHouseholdRole] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [householdBudget, setHouseholdBudget] = useState(0)
  const [householdCurrency, setHouseholdCurrency] = useState('CZK')
  const [householdProfile, setHouseholdProfile] = useState<MobileHouseholdProfileData | null>(null)
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

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data
      const url = typeof data?.url === 'string' ? data.url : '/'
      const slug = new URL(url, 'https://anitka.example').searchParams.get('tab')
      const tabs: Record<string, NativeTab> = {
        akce: 'deals', nakup: 'shopping', zasoby: 'pantry', obchody: 'stores',
        recepty: 'recipes', rozpocet: 'budget', profil: 'profile',
      }
      setActiveTab(slug ? tabs[slug] ?? 'home' : 'home')
      setNotificationsOpen(false)
    })
    return () => subscription.remove()
  }, [])

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
        setHouseholdProfile(null)
        setItems([])
        setPendingChanges(0)
        setOffline(false)
        setUnreadNotificationCount(0)
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
      setUserEmail(profile.user.email)
      setHouseholdRole(profile.household?.role ?? '')
      setHouseholdName(profile.household?.name ?? '')
      setHouseholdBudget(profile.household?.monthlyBudget ?? 0)
      setHouseholdCurrency(profile.household?.currency ?? 'CZK')
      setHouseholdProfile(profile.household?.profile ?? null)
      if (!profile.household) {
        setHouseholdMissing(true)
        setHouseholdAvailable(false)
        setItems([])
        setPendingChanges(0)
        setOffline(false)
        setUnreadNotificationCount(0)
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
      void getNotifications().then(({ notifications }) => setUnreadNotificationCount(notifications.filter((notification) => notification.unread).length)).catch(() => undefined)
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
      await unregisterDevicePushForSignOut().catch(() => undefined)
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
      setUserEmail('')
      setHouseholdRole('')
      setHouseholdName('')
      setHouseholdBudget(0)
      setHouseholdCurrency('CZK')
      setActiveTab('home')
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
      setUserEmail('')
      setHouseholdRole('')
      setHouseholdName('')
      setHouseholdBudget(0)
      setHouseholdCurrency('CZK')
      setBusy(false)
    }
  }

  async function handleAdd(value = newName.trim(), quantity = 1, unit: ItemUnit = 'ks') {
    const name = value.trim()
    if (!name || !Number.isFinite(quantity) || quantity <= 0 || busy || busyItemId) return
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
          item: { id: itemId, name, quantity, unit, done: false },
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
  const pageTitle = activeTab === 'shopping' && shoppingView === 'receipts' ? 'Účtenky' : activeTab === 'shopping' && shoppingView === 'purchases' ? 'Moje nákupy' : ({
    home: 'Asistent pro domácnost',
    shopping: 'Nákup',
    budget: 'Rozpočet',
    pantry: 'Zásoby',
    deals: 'Akce',
    stores: 'Obchody',
    recipes: 'Recepty',
    profile: 'Profil',
  }[activeTab])

  if (busy && !signedIn) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
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
          <View style={styles.nativeHeaderLeft}>
            <Pressable accessibilityLabel="Otevřít chat s Anitkou" accessibilityRole="button" onPress={() => setAssistantOpen(true)} style={styles.brandMark}>
              <View style={styles.mascotCrop}><Image accessibilityLabel="Anitka" resizeMode="contain" source={require('../assets/anitka-guide-front.webp')} style={styles.mascotImage} /></View>
            </Pressable>
            <Text numberOfLines={1} style={styles.nativeHeaderTitle}>{householdAvailable ? pageTitle : 'Nákup'}</Text>
          </View>
          <View style={styles.nativeHeaderActions}>
            <Pressable accessibilityLabel={unreadNotificationCount ? `Upozornění, ${unreadNotificationCount} nepřečtených` : 'Upozornění'} accessibilityRole="button" onPress={() => setNotificationsOpen(true)} style={styles.headerIconButton}><Bell color={colors.primary} size={20} />{unreadNotificationCount > 0 ? <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}</Text></View> : null}</Pressable>
            <Pressable accessibilityLabel={`Profil: ${userName}`} accessibilityRole="button" onPress={() => setActiveTab('profile')} style={styles.profileHeaderButton}>
              <Text style={styles.profileHeaderInitials}>{userName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?'}</Text>
              <ChevronDown color={colors.mutedText} size={13} />
            </Pressable>
          </View>
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
            {activeTab === 'home' ? (
              <NativeHomeScreen
                hasPreferences={Boolean(householdProfile && (householdProfile.preferences.preferredProducts.length || householdProfile.preferences.preferredBrands.length))}
                name={userName}
                onAddToShopping={(name, quantity = 1, unit = 'ks') => { setActiveTab('shopping'); setShoppingView('list'); void handleAdd(name, quantity, unit) }}
                onOpenReceipts={() => { setShoppingView('receipts'); setActiveTab('shopping') }}
                onQuickExpense={() => { setQuickExpenseToken((current) => current + 1); setActiveTab('budget') }}
                onSelect={setActiveTab}
              />
            ) : activeTab === 'shopping' ? (
              <>
                <View style={styles.sectionSwitcher}>
                  <Pressable accessibilityRole="tab" accessibilityState={{ selected: shoppingView === 'list' }} onPress={() => setShoppingView('list')} style={[styles.sectionTab, shoppingView === 'list' && styles.sectionTabActive]}><Text style={[styles.sectionTabText, shoppingView === 'list' && styles.sectionTabTextActive]}>Nákupní seznam</Text></Pressable>
                  <Pressable accessibilityRole="tab" accessibilityState={{ selected: shoppingView === 'purchases' }} onPress={() => setShoppingView('purchases')} style={[styles.sectionTab, shoppingView === 'purchases' && styles.sectionTabActive]}><Text style={[styles.sectionTabText, shoppingView === 'purchases' && styles.sectionTabTextActive]}>Moje nákupy</Text></Pressable>
                  <Pressable accessibilityRole="tab" accessibilityState={{ selected: shoppingView === 'receipts' }} onPress={() => setShoppingView('receipts')} style={[styles.sectionTab, shoppingView === 'receipts' && styles.sectionTabActive]}><Text style={[styles.sectionTabText, shoppingView === 'receipts' && styles.sectionTabTextActive]}>Účtenky</Text></Pressable>
                </View>
                {shoppingView === 'receipts' ? <ReceiptsScreen onAuthExpired={handleAuthExpired} /> : shoppingView === 'purchases' ? <NativePurchasesScreen /> : (
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
                    placeholderTextColor={colors.mutedText}
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
                    <ActivityIndicator color={colors.primary} size="large" />
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
                )}
              </>
            ) : activeTab === 'deals' ? (
              <NativeDealsScreen listNames={items.filter((item) => !item.done).map((item) => item.name)} onAdd={(name) => { setActiveTab('shopping'); setShoppingView('list'); setNewName(name); void handleAdd(name) }} />
            ) : activeTab === 'stores' ? (
              <NativeStoresScreen />
            ) : activeTab === 'profile' ? (
              <NativeProfileScreen
                email={userEmail}
                profile={householdProfile}
                householdBudget={householdBudget}
                householdCurrency={householdCurrency}
                householdName={householdName}
                householdRole={householdRole}
                name={userName}
                onAuthExpired={handleAuthExpired}
                onProfileUpdate={setHouseholdProfile}
                onReload={load}
                onSignOut={() => void handleSignOut()}
                onUpdateHousehold={(changes) => {
                  setHouseholdName(changes.name)
                  setHouseholdBudget(changes.monthlyBudget)
                }}
              />
            ) : activeTab === 'recipes' ? (
              <>
                <View style={styles.sectionSwitcher}>
                  <Pressable accessibilityRole="tab" accessibilityState={{ selected: recipeView === 'recipes' }} onPress={() => setRecipeView('recipes')} style={[styles.sectionTab, recipeView === 'recipes' && styles.sectionTabActive]}><Text style={[styles.sectionTabText, recipeView === 'recipes' && styles.sectionTabTextActive]}>Recepty</Text></Pressable>
                  <Pressable accessibilityRole="tab" accessibilityState={{ selected: recipeView === 'meals' }} onPress={() => setRecipeView('meals')} style={[styles.sectionTab, recipeView === 'meals' && styles.sectionTabActive]}><Text style={[styles.sectionTabText, recipeView === 'meals' && styles.sectionTabTextActive]}>Jídelníček</Text></Pressable>
                </View>
                {recipeView === 'meals' ? <MealPlanScreen onAuthExpired={handleAuthExpired} /> : <RecipesScreen onAuthExpired={handleAuthExpired} />}
              </>
            ) : activeTab === 'budget' ? (
              <BudgetScreen onAuthExpired={handleAuthExpired} quickAddExpenseToken={quickExpenseToken} />
            ) : activeTab === 'pantry' ? (
              <PantryScreen onAuthExpired={handleAuthExpired} />
            ) : (
              <BudgetScreen onAuthExpired={handleAuthExpired} />
            )}
          </>
        )}
        {householdAvailable ? <NativeBottomNav active={activeTab} onSelect={setActiveTab} /> : null}
      </KeyboardAvoidingView>
      <NativeAssistantModal onClose={() => setAssistantOpen(false)} onShopping={() => setActiveTab('shopping')} visible={assistantOpen} />
      <NativeNotificationsModal onClose={() => setNotificationsOpen(false)} onUnreadCount={setUnreadNotificationCount} visible={notificationsOpen} />
      <BarcodeScannerModal
        busy={barcodeBusy}
        onBarcodeScanned={(barcode) => void handleBarcodeScanned(barcode)}
        onClose={() => setBarcodeScannerOpen(false)}
        visible={barcodeScannerOpen}
      />
    </SafeAreaView>
  )
}

function useStyles() {
  const { colors } = useMobileTheme()
  return useMemo(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  loginContent: { width: '100%', maxWidth: 384, alignSelf: 'center' },
  loginBrand: { alignItems: 'center', marginBottom: 24, gap: 4 },
  loginLogo: { width: 220, height: 74 },
  poweredBy: { color: colors.mutedText, fontSize: 12, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase' },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 7, gap: 12, borderBottomColor: colors.border, borderBottomWidth: 1, backgroundColor: colors.background },
  nativeHeaderLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11 },
  nativeHeaderTitle: { flexShrink: 1, color: colors.foreground, fontSize: 16, fontWeight: '700' },
  nativeHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerIconButton: { position: 'relative', width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  notificationBadge: { position: 'absolute', top: 1, right: 0, minWidth: 17, height: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderRadius: 9, backgroundColor: colors.destructive },
  notificationBadgeText: { color: colors.primaryForeground, fontSize: 9, lineHeight: 12, fontWeight: '800' },
  profileHeaderButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, borderRadius: 14, backgroundColor: colors.muted },
  profileHeaderInitials: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  sectionSwitcher: { minHeight: 42, flexDirection: 'row', alignSelf: 'stretch', alignItems: 'center', padding: 4, marginHorizontal: 16, marginTop: 8, marginBottom: 4, borderRadius: 14, backgroundColor: colors.muted },
  sectionTab: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  sectionTabActive: { backgroundColor: colors.card },
  sectionTabText: { color: colors.secondaryText, fontSize: 13, fontWeight: '600' },
  sectionTabTextActive: { color: colors.foreground, fontWeight: '700' },
  headerText: { flex: 1, minWidth: 0 },
  homeBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  brandMark: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accentSubtle, overflow: 'hidden' },
  mascotCrop: { width: '100%', height: '100%', borderRadius: 21, overflow: 'hidden' },
  mascotImage: { position: 'absolute', width: 58, height: 78, left: -8, top: -1 },
  brand: { color: colors.primary, fontSize: 14, fontWeight: '800', letterSpacing: 1.1 },
  brandSubtitle: { color: colors.mutedText, fontSize: 11, fontWeight: '500', marginTop: 1 },
  title: { color: colors.foreground, fontSize: 24, fontWeight: '700', marginTop: 4 },
  loginTitle: { color: colors.foreground, fontSize: 20, fontWeight: '600', letterSpacing: -0.2 },
  supporting: { color: colors.secondaryText, fontSize: 14, lineHeight: 20, marginTop: 5 },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, margin: 16, padding: 16, gap: 12 },
  loginCard: { width: '100%', margin: 0, padding: 24, borderRadius: 24, gap: 12 },
  loginError: { marginHorizontal: 0, marginBottom: 0 },
  fieldGroup: { gap: 4 },
  label: { color: colors.foreground, fontSize: 14 },
  loginFooter: { color: colors.mutedText, fontSize: 14, textAlign: 'center', marginTop: 4 },
  loginLink: { color: colors.primary, fontWeight: '600' },
  sectionTitle: { color: colors.foreground, fontSize: 18, fontWeight: '700' },
  input: { minHeight: 44, borderColor: colors.inputBorder, borderRadius: 12, borderWidth: 1, backgroundColor: colors.card, color: colors.foreground, paddingHorizontal: 12, fontSize: 14 },
  primaryButton: { minHeight: 48, minWidth: 80, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  loginButton: { minHeight: 44, marginTop: 4 },
  disabledButton: { opacity: 0.55 },
  primaryButtonText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' },
  secondaryButton: { minHeight: 44, borderColor: colors.inputBorder, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryButtonText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  error: { color: colors.destructive, backgroundColor: colors.destructiveSubtle, borderRadius: 12, marginHorizontal: 16, marginBottom: 8, padding: 12, fontSize: 14, lineHeight: 20 },
  offlineNotice: { flexDirection: 'column', alignItems: 'stretch', gap: 8, backgroundColor: colors.accentSubtle, borderColor: colors.warning, borderRadius: 12, borderWidth: 1, marginHorizontal: 16, marginBottom: 8, padding: 10 },
  offlineNoticeText: { flex: 1, color: colors.warning, fontSize: 13, lineHeight: 18 },
  pendingLabel: { color: colors.warning, fontSize: 12, marginTop: 4 },
  summary: { minHeight: 52, marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryText: { color: colors.secondaryText, fontSize: 14, fontWeight: '600' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  scanButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginBottom: 12, borderColor: colors.inputBorder, borderRadius: 12, borderWidth: 1, backgroundColor: colors.card },
  scanButtonText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  addInput: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  itemRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 12, gap: 12 },
  checkbox: { width: 44, height: 44, borderColor: colors.inputBorder, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: colors.primaryForeground, fontSize: 22, fontWeight: '700' },
  itemText: { flex: 1, minWidth: 0 },
  itemName: { color: colors.foreground, fontSize: 16, fontWeight: '600' },
  itemDone: { color: colors.mutedText, textDecorationLine: 'line-through' },
  itemQuantity: { color: colors.secondaryText, fontSize: 13, marginTop: 4 },
  emptyState: { alignItems: 'center', justifyContent: 'center', margin: 16, padding: 28, backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: 8 },
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unitButton: { minHeight: 44, minWidth: 48, borderColor: colors.inputBorder, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  unitSelected: { backgroundColor: colors.accentSubtle, borderColor: colors.primary },
  unitText: { color: colors.secondaryText, fontSize: 14, fontWeight: '600' },
  unitTextSelected: { color: colors.accentText },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  tabBar: { borderTopColor: colors.border, borderTopWidth: 1, backgroundColor: colors.card },
  tabScroll: { flexGrow: 0 },
  tabItems: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4, gap: 6 },
  tab: { width: 80, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  tabActive: { backgroundColor: colors.accentSubtle },
  tabText: { color: colors.secondaryText, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: colors.accentText },
}), [colors])
}
