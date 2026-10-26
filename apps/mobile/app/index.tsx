import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
import { useObserve } from 'expo-observe'
import * as SecureStore from 'expo-secure-store'
import { Bell, ChevronDown, ChevronUp } from 'lucide-react-native'
import { ITEM_UNITS, unitLabel, type ItemUnit } from '@anitka/shared/units'
import { useMobileTheme } from '../lib/theme'
import { unregisterDevicePushForSignOut } from '../lib/push-notifications'
import { BudgetScreen } from '../components/budget-screen'
import { PantryScreen } from '../components/pantry-screen'
import { RecipesScreen } from '../components/recipes-screen'
import { MealPlanScreen } from '../components/meal-plan-screen'
import { BarcodeScannerModal } from '../components/barcode-scanner-modal'
import { NativeGuideModal } from '../components/native-guide-modal'
import { useNativeGuideTarget } from '../components/native-guide-targets'
import { ShoppingToolsModal } from '../components/shopping-tools-modal'
import { ReceiptsScreen } from '../components/receipts-screen'
import { UsualItemsScreen } from '../components/usual-items-screen'
import { hasPriceComparison, NativePriceComparison } from '../components/price-comparison'
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
import { getAccessToken, hasLocalAuthSession, passwordResetCallbackUrl, requestPasswordReset, resetPassword, sendVerificationCode, signIn, signOut, signUp, verifyEmailCode, verifyEmailLink } from '../lib/auth'
import { GUIDE_DONE_KEY, shouldAutoStartGuide } from '../../../lib/guide'
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
  clearDoneShoppingItems,
  createShoppingList,
  getCurrentUser,
  getDashboardSummary,
  getNotifications,
  getShoppingList,
  lookupBarcode,
  MobileApiError,
  toggleShoppingItem,
  updateShoppingItem,
  type MobileShoppingItem,
  type MobileShoppingList,
  type MobileDashboardSummary,
  type MobilePantryItem,
  type MobileHouseholdProfileData,
} from '../lib/shopping-list-api'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Operaci se nepodařilo dokončit. Zkuste to znovu.'
}

const activeShoppingListKey = (householdId: string) => `anitka.active-shopping-list:${householdId}`

type MobileAuthAction =
  | { kind: 'sign-in'; email: string; password: string }
  | { kind: 'sign-up'; email: string; password: string; name: string }
  | { kind: 'verify-code'; email: string; code: string }
  | { kind: 'resend-code'; email: string }
  | { kind: 'request-reset'; email: string }
  | { kind: 'reset-password'; token: string; password: string }
  | { kind: 'verify-link'; token: string }

type FocusedNativeTarget = { kind: 'receipt' | 'pantry-item'; id: string }

function LoginForm({ onAuthAction, busy, error }: { onAuthAction: (action: MobileAuthAction) => Promise<void>; busy: boolean; error: string | null }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'verify' | 'forgot' | 'reset'>('sign-in')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [notice, setNotice] = useState('')
  const signInInFlight = useRef(false)

  useEffect(() => {
    let active = true
    const handleUrl = (url: string) => {
      try {
        const parsed = new URL(url)
        const path = `${parsed.hostname}${parsed.pathname}`.toLowerCase()
        const authAction = parsed.searchParams.get('auth')
        const token = parsed.searchParams.get('token')
        if (path.includes('reset-password') || authAction === 'reset-password') {
          setMode(token ? 'reset' : 'forgot')
          setResetToken(token ?? '')
          setEmail(parsed.searchParams.get('email') ?? '')
          setNotice(token ? '' : 'Odkaz není platný nebo vypršel. Požádejte o nový.')
          return
        }
        if (path.includes('verified') || authAction === 'verified') {
          if (token) {
            void onAuthAction({ kind: 'verify-link', token }).then(() => {
              if (active) { setMode('sign-in'); setNotice('E-mail ověřen. Nyní se můžete přihlásit.') }
            }).catch(() => undefined)
          } else {
            setMode('sign-in')
            setNotice(parsed.searchParams.has('error') ? 'Ověřovací odkaz není platný nebo vypršel.' : 'E-mail ověřen. Nyní se můžete přihlásit.')
          }
        }
      } catch {
        // Ignore unrelated links opened by the operating system.
      }
    }
    void Linking.getInitialURL().then((url) => { if (active && url) handleUrl(url) })
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url))
    return () => { active = false; subscription.remove() }
  }, [onAuthAction])

  async function perform(action: MobileAuthAction, onSuccess: () => void) {
    setNotice('')
    try {
      await onAuthAction(action)
      onSuccess()
    } catch {
      // The parent exposes the auth error in the shared login panel.
    }
  }

  const title = mode === 'sign-up' ? 'Založit účet' : mode === 'verify' ? 'Ověřit e-mail' : mode === 'forgot' ? 'Obnovit heslo' : mode === 'reset' ? 'Nastavit nové heslo' : 'Přihlásit se'
  const actionLabel = mode === 'sign-up' ? 'Vytvořit účet' : mode === 'verify' ? 'Ověřit kód' : mode === 'forgot' ? 'Poslat odkaz' : mode === 'reset' ? 'Uložit heslo' : 'Přihlásit se'

  function submit() {
    if (mode === 'sign-up') {
      void perform({ kind: 'sign-up', email: email.trim(), password, name: name.trim() }, () => {
        setMode('verify')
        void perform({ kind: 'resend-code', email: email.trim() }, () => setNotice('Účet je vytvořen. Zadejte šestimístný kód z e-mailu.'))
      })
    } else if (mode === 'verify') {
      void perform({ kind: 'verify-code', email: email.trim(), code: code.trim() }, () => {
        setMode('sign-in')
        setNotice('E-mail ověřen. Nyní se můžete přihlásit.')
      })
    } else if (mode === 'forgot') {
      void perform({ kind: 'request-reset', email: email.trim() }, () => {
        setMode('sign-in')
        setNotice('Pokud je účet pro tento e-mail dostupný, poslali jsme odkaz pro obnovu hesla.')
      })
    } else if (mode === 'reset') {
      if (!resetToken) return
      void perform({ kind: 'reset-password', token: resetToken, password }, () => {
        setMode('sign-in')
        setPassword('')
        setResetToken('')
        setNotice('Heslo bylo změněno. Přihlaste se novým heslem.')
      })
    } else {
      if (signInInFlight.current || busy) return
      signInInFlight.current = true
      void perform({ kind: 'sign-in', email: email.trim(), password }, () => undefined)
        .finally(() => { signInInFlight.current = false })
    }
  }

  return (
    <View style={styles.centered}>
      <View style={styles.loginContent}>
        <View style={styles.loginBrand}>
          <Image accessibilityLabel="ANITKA" resizeMode="contain" source={require('../assets/anitka-logo.png')} style={styles.loginLogo} />
          <Text style={styles.poweredBy}>Powered by ANITKA AI</Text>
        </View>
        <View style={[styles.card, styles.loginCard]}>
          <Text style={styles.loginTitle}>{title}</Text>
          <Text style={styles.supporting}>{mode === 'sign-in' ? 'Vítejte zpátky. Pojďme uhlídat rozpočet.' : mode === 'verify' ? 'Zadejte kód, který jsme poslali na váš e-mail.' : mode === 'reset' ? 'Odkaz pro obnovu je připravený. Zvolte nové heslo.' : 'Použijte svůj e-mail pro bezpečné pokračování.'}</Text>
          {error ? <Text accessibilityRole="alert" style={[styles.error, styles.loginError]}>{error}</Text> : null}
          {notice ? <Text accessibilityLiveRegion="polite" style={styles.supporting}>{notice}</Text> : null}
          {mode === 'sign-up' ? <View style={styles.fieldGroup}>
            <Text style={styles.label}>Jméno</Text>
            <TextInput accessibilityLabel="Jméno" autoComplete="name" onChangeText={setName} placeholder="" placeholderTextColor={colors.mutedText} style={styles.input} value={name} />
          </View> : null}
          {mode !== 'reset' && mode !== 'verify' ? <View style={styles.fieldGroup}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput accessibilityLabel="E-mail" autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="" placeholderTextColor={colors.mutedText} returnKeyType="next" style={styles.input} value={email} />
          </View> : null}
          {mode === 'verify' ? <View style={styles.fieldGroup}>
            <Text style={styles.label}>Ověřovací kód</Text>
            <TextInput accessibilityLabel="Ověřovací kód" autoComplete="one-time-code" keyboardType="number-pad" maxLength={6} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" placeholderTextColor={colors.mutedText} style={styles.input} value={code} />
          </View> : null}
          {['sign-in', 'sign-up', 'reset'].includes(mode) ? <View style={styles.fieldGroup}>
            <Text style={styles.label}>{mode === 'reset' ? 'Nové heslo' : 'Heslo'}</Text>
            <TextInput
              accessibilityLabel={mode === 'reset' ? 'Nové heslo' : 'Heslo'}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              onChangeText={setPassword}
              onSubmitEditing={submit}
              placeholder=""
              placeholderTextColor={colors.mutedText}
              returnKeyType="go"
              secureTextEntry
              style={styles.input}
              value={password}
            />
          </View> : null}
          <PrimaryButton
            disabled={busy || (mode !== 'reset' && mode !== 'verify' && !email.trim()) || ((mode === 'sign-in' || mode === 'sign-up' || mode === 'reset') && password.length < (mode === 'sign-in' ? 1 : 8)) || (mode === 'sign-up' && !name.trim()) || (mode === 'verify' && code.length !== 6) || (mode === 'reset' && !resetToken)}
            label={busy ? 'Zpracovávám…' : actionLabel}
            onPress={submit}
            style={styles.loginButton}
            testID="login-submit"
          />
          {mode === 'verify' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void perform({ kind: 'resend-code', email: email.trim() }, () => setNotice('Pokud je účet potřeba ověřit, poslali jsme nový kód.'))}><Text style={styles.loginFooter}>Poslat nový kód</Text></Pressable> : null}
          {mode === 'sign-in' ? <Pressable accessibilityRole="button" onPress={() => { setMode('forgot'); setNotice('') }}><Text style={styles.loginFooter}>Zapomněli jste heslo?</Text></Pressable> : null}
          {mode === 'sign-in' ? <Pressable accessibilityRole="button" onPress={() => { setMode('sign-up'); setNotice('') }}><Text style={styles.loginFooter}>Ještě nemáte účet? Založte si ho</Text></Pressable> : null}
          {mode !== 'sign-in' ? <Pressable accessibilityRole="button" onPress={() => { setMode('sign-in'); setNotice('') }}><Text style={styles.loginFooter}>Zpět k přihlášení</Text></Pressable> : null}
        </View>
      </View>
    </View>
  )
}

function PrimaryButton({ label, onPress, disabled = false, style, testID }: { label: string; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; testID?: string }) {
  const styles = useStyles()
  return (
    <Pressable testID={testID} accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primaryButton, style, disabled && styles.disabledButton]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  )
}

function ShoppingRow({
  item,
  busy,
  disabled,
  priceData,
  guideTargetRef,
  onToggle,
  onEdit,
}: {
  item: MobileShoppingItem
  busy: boolean
  disabled: boolean
  priceData: MobileDashboardSummary | null
  guideTargetRef?: ReturnType<typeof useNativeGuideTarget>
  onToggle: () => void
  onEdit: () => void
}) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [pricesOpen, setPricesOpen] = useState(false)
  const hasPrices = !item.done && priceData != null && hasPriceComparison(priceData.productPrices, priceData.offers, item.name)
  return (
    <View style={styles.shoppingRowGroup}>
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
      <Pressable ref={guideTargetRef} accessibilityLabel={`Upravit množství položky ${item.name}`} accessibilityRole="button" disabled={disabled} onPress={onEdit} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Upravit</Text>
      </Pressable>
    </View>
    {hasPrices ? <>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: pricesOpen }} onPress={() => setPricesOpen((value) => !value)} style={styles.priceToggle}>
        <Text style={styles.priceToggleText}>{pricesOpen ? 'Skrýt ceny' : 'Porovnat ceny'}</Text>
        {pricesOpen ? <ChevronUp color={colors.accentText} size={16} /> : <ChevronDown color={colors.accentText} size={16} />}
      </Pressable>
      {pricesOpen && priceData ? <NativePriceComparison productName={item.name} productPrices={priceData.productPrices} offers={priceData.offers} today={priceData.today} /> : null}
    </> : null}
    </View>
  )
}

export default function HomeScreen() {
  const { markInteractive } = useObserve()
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const [activeTab, setActiveTab] = useState<NativeTab>('home')
  const [shoppingView, setShoppingView] = useState<'list' | 'purchases' | 'receipts'>('list')
  const [recipeView, setRecipeView] = useState<'recipes' | 'meals'>('recipes')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideStepId, setGuideStepId] = useState<string | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [shoppingToolsOpen, setShoppingToolsOpen] = useState(false)
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const [quickExpenseToken, setQuickExpenseToken] = useState(0)
  const [pantryReviewToken, setPantryReviewToken] = useState(0)
  const [focusedTarget, setFocusedTarget] = useState<FocusedNativeTarget | null>(null)
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
  const [activeListId, setActiveListId] = useState('')
  const [shoppingLists, setShoppingLists] = useState<{ id: string; name: string }[]>([])
  const [listCreateOpen, setListCreateOpen] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [listActionBusy, setListActionBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const [editItem, setEditItem] = useState<MobileShoppingItem | null>(null)
  const [editQuantity, setEditQuantity] = useState('')
  const [editUnit, setEditUnit] = useState<ItemUnit>('ks')
  const [priceData, setPriceData] = useState<MobileDashboardSummary | null>(null)
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false)
  const [barcodeBusy, setBarcodeBusy] = useState(false)
  const [pendingChanges, setPendingChanges] = useState(0)
  const [offline, setOffline] = useState(false)
  const barcodeHandled = useRef(false)
  const guideAutoStartChecked = useRef(false)
  const offlineSnapshot = useRef<OfflineShoppingSnapshot | null>(null)
  const assistantGuideTarget = useNativeGuideTarget('assistant-open')
  const notificationGuideTarget = useNativeGuideTarget('notification-button')
  const homeNavGuideTarget = useNativeGuideTarget('nav-home')
  const shoppingNavGuideTarget = useNativeGuideTarget('nav-shopping')
  const pantryNavGuideTarget = useNativeGuideTarget('nav-pantry')
  const budgetNavGuideTarget = useNativeGuideTarget('nav-budget')
  const moreGuideTarget = useNativeGuideTarget('nav-more')
  const shoppingInputGuideTarget = useNativeGuideTarget('shopping-input')
  const shoppingItemGuideTarget = useNativeGuideTarget('shopping-item-row')
  const shoppingToolsGuideTarget = useNativeGuideTarget('shopping-tools')
  const shoppingFinishGuideTarget = useNativeGuideTarget('shopping-finish')

  const navigateGuide = useCallback((tab: NativeTab, stepId?: string) => {
    setActiveTab(tab)
    setGuideStepId(stepId ?? null)
    if (tab === 'shopping') setShoppingView(stepId === 'receipts' ? 'receipts' : stepId === 'purchases' ? 'purchases' : 'list')
    setShoppingToolsOpen(stepId === 'shopping-plan' || stepId === 'shopping-search')
    if (tab === 'recipes') setRecipeView(stepId === 'mealplan' ? 'meals' : 'recipes')
  }, [])

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data
      const url = typeof data?.url === 'string' ? data.url : '/'
      const params = new URL(url, 'https://anitka.example').searchParams
      const slug = params.get('tab')
      const tabs: Record<string, NativeTab> = {
        akce: 'deals', nakup: 'shopping', zasoby: 'pantry', obchody: 'stores',
        recepty: 'recipes', rozpocet: 'budget', profil: 'profile',
      }
      setActiveTab(slug ? tabs[slug] ?? 'home' : 'home')
      const focusKind = params.get('focus') ?? params.get('target') ?? params.get('targetType')
      const targetId = params.get('targetId') ?? params.get('id')
      const receiptId = params.get('receiptId') ?? (focusKind === 'receipt' ? targetId : null)
      const pantryItemId = params.get('pantryItemId') ?? params.get('itemId') ?? (focusKind === 'pantry-item' || focusKind === 'pantry' ? targetId : null)
      if (receiptId) {
        setFocusedTarget({ kind: 'receipt', id: receiptId })
        setShoppingView('receipts')
        setActiveTab('shopping')
      } else if (pantryItemId) {
        setFocusedTarget({ kind: 'pantry-item', id: pantryItemId })
        setActiveTab('pantry')
      } else {
        const notificationTarget = data?.focus
        if (notificationTarget && typeof notificationTarget === 'object' && 'kind' in notificationTarget && 'id' in notificationTarget && typeof notificationTarget.id === 'string') {
          if (notificationTarget.kind === 'receipt') {
            setFocusedTarget({ kind: 'receipt', id: notificationTarget.id })
            setShoppingView('receipts')
            setActiveTab('shopping')
          } else if (notificationTarget.kind === 'pantry-item' || notificationTarget.kind === 'pantry') {
            setFocusedTarget({ kind: 'pantry-item', id: notificationTarget.id })
            setActiveTab('pantry')
          }
        }
      }
      if (params.get('nakupView') === 'uctenky' || params.get('view') === 'receipts') setShoppingView('receipts')
      if (slug === 'zasoby' && params.get('kontrola') === '1') setPantryReviewToken((current) => current + 1)
      setNotificationsOpen(false)
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (!signedIn || !householdAvailable || guideAutoStartChecked.current) return
    let active = true
    SecureStore.getItemAsync(GUIDE_DONE_KEY)
      .then((stored) => {
        if (!active) return
        guideAutoStartChecked.current = true
        if (shouldAutoStartGuide(stored)) setGuideOpen(true)
      })
      .catch(() => { if (active) guideAutoStartChecked.current = true })
    return () => { active = false }
  }, [householdAvailable, signedIn])

  function showSnapshot(snapshot: OfflineShoppingSnapshot) {
    offlineSnapshot.current = snapshot
    setPendingChanges(snapshot.pending.length)
    setItems(applyOfflineOperations(snapshot.list.items, snapshot.pending))
    const options = snapshot.list.lists ?? []
    setShoppingLists(options)
    setActiveListId(snapshot.list.listId)
    setListName(options.find((list) => list.id === snapshot.list.listId)?.name ?? snapshot.list.shoppingLists[0] ?? 'Nákupní seznam')
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
        const listId = offlineSnapshot.current?.list.listId
        const list = await getShoppingList(listId)
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
      if (!token && !(await hasLocalAuthSession())) {
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
        const savedListId = await SecureStore.getItemAsync(activeShoppingListKey(context.householdId)).catch(() => null)
        let list: MobileShoppingList
        try {
          list = await getShoppingList(savedListId ?? undefined)
        } catch (caught) {
          if (!savedListId || !(caught instanceof MobileApiError) || caught.status !== 404) throw caught
          list = await getShoppingList()
        }
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
        await SecureStore.setItemAsync(activeShoppingListKey(context.householdId), list.listId).catch(() => undefined)
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

  // The login screen is a valid entry state too: report readiness after initial auth/bootstrap settles.
  useEffect(() => {
    if (!busy) markInteractive()
  }, [busy, markInteractive])

  const pricingNamesKey = items.filter((item) => !item.done).map((item) => item.name).join('\u001f')
  useEffect(() => {
    if (!signedIn || !householdAvailable || activeTab !== 'shopping' || shoppingView !== 'list' || offline) {
      if (offline) setPriceData(null)
      return
    }
    let active = true
    getDashboardSummary()
      .then((summary) => { if (active) setPriceData(summary) })
      .catch(() => { if (active) setPriceData(null) })
    return () => { active = false }
  }, [activeTab, householdAvailable, offline, pricingNamesKey, shoppingView, signedIn])

  const handleAuthAction = useCallback(async (action: MobileAuthAction) => {
    setSigningIn(true)
    setError(null)
    try {
      switch (action.kind) {
        case 'sign-in':
          await clearLastOfflineContext()
          await signIn(action.email, action.password)
          await load()
          if (!guideAutoStartChecked.current) {
            const storedGuideState = await SecureStore.getItemAsync(GUIDE_DONE_KEY).catch(() => null)
            guideAutoStartChecked.current = true
            if (shouldAutoStartGuide(storedGuideState)) setGuideOpen(true)
          }
          break
        case 'sign-up':
          await signUp(action.email, action.password, action.name)
          break
        case 'verify-code':
          await verifyEmailCode(action.email, action.code)
          break
        case 'resend-code':
          await sendVerificationCode(action.email)
          break
        case 'request-reset':
          await requestPasswordReset(action.email, passwordResetCallbackUrl())
          break
        case 'reset-password':
          await resetPassword(action.token, action.password)
          break
        case 'verify-link':
          await verifyEmailLink(action.token)
          break
      }
    } catch (caught) {
      setError(errorMessage(caught))
      throw caught
    } finally {
      setSigningIn(false)
    }
  }, [load])

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

  async function addCatalogProduct(item: MobileShoppingItem) {
    const current = offlineSnapshot.current
    if (current) {
      const updated = { ...current, list: { ...current.list, items: [...current.list.items, item] } }
      await saveOfflineSnapshot(updated)
      showSnapshot(updated)
    } else {
      setItems((existing) => [...existing, item])
    }
  }

  async function addPantryReviewItems(pantryItems: MobilePantryItem[]) {
    const onList = new Set(items.filter((item) => !item.done).map((item) => item.name.trim().toLocaleLowerCase('cs')))
    let added = 0
    try {
      for (const pantryItem of pantryItems) {
        const key = pantryItem.name.trim().toLocaleLowerCase('cs')
        if (onList.has(key)) continue
        const result = await addShoppingItem(
          pantryItem.name,
          createOfflineItemId().slice('offline-'.length),
          1,
          pantryItem.unit,
          { category: pantryItem.category, detail: 'došlo ze zásob', listId: activeListId },
        )
        onList.add(key)
        added += 1
        const current = offlineSnapshot.current
        if (current) {
          const next = { ...current, list: { ...current.list, items: [...current.list.items, result.item] } }
          await saveOfflineSnapshot(next)
          showSnapshot(next)
        } else {
          setItems((itemsNow) => [...itemsNow, result.item])
        }
      }
      return { added, failed: false }
    } catch (caught) {
      setError(errorMessage(caught))
      if (caught instanceof MobileApiError && caught.status === 401) handleAuthExpired()
      return { added, failed: true }
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

  async function handleClearDoneItems() {
    if (offline || pendingChanges > 0 || busy || busyItemId) return
    setBusyItemId('clear-done')
    setError(null)
    try {
      await syncPendingChanges(true)
      const current = offlineSnapshot.current
      if (!current || current.pending.length > 0) throw new Error('Neuložené změny je potřeba nejdřív synchronizovat.')
      await clearDoneShoppingItems(current.list.listId)
      const freshList = await getShoppingList(current.list.listId)
      const next = { ...current, list: freshList, pending: [] }
      await saveOfflineSnapshot(next)
      showSnapshot(next)
    } catch (caught) {
      setError(errorMessage(caught))
      if (caught instanceof MobileApiError && caught.status === 401) handleAuthExpired()
    } finally {
      setBusyItemId(null)
    }
  }

  async function selectShoppingList(listId: string) {
    if (!listId || listId === activeListId || offline || pendingChanges > 0 || busy || busyItemId || listActionBusy) return
    setListActionBusy(true)
    setError(null)
    try {
      const current = offlineSnapshot.current
      if (!current || current.pending.length > 0) throw new Error('Neuložené změny je potřeba nejdřív synchronizovat.')
      const list = await getShoppingList(listId)
      const next = { ...current, list, pending: [] }
      await saveOfflineSnapshot(next)
      await SecureStore.setItemAsync(activeShoppingListKey(current.householdId), listId).catch(() => undefined)
      showSnapshot(next)
      setEditItem(null)
      setNewName('')
    } catch (caught) {
      setError(errorMessage(caught))
      if (caught instanceof MobileApiError && caught.status === 401) handleAuthExpired()
    } finally {
      setListActionBusy(false)
    }
  }

  async function submitNewShoppingList() {
    const name = newListName.trim()
    if (!name || listActionBusy) return
    if (shoppingLists.some((list) => list.name === name)) {
      setError('Seznam s tímto názvem už existuje.')
      return
    }
    setListActionBusy(true)
    setError(null)
    try {
      const current = offlineSnapshot.current
      if (!current || offline || pendingChanges > 0) throw new Error('Nový seznam lze vytvořit po připojení a synchronizaci změn.')
      const { list: created } = await createShoppingList(name)
      const options = [...(current.list.lists ?? []), created]
      const list: MobileShoppingList = {
        listId: created.id,
        items: [],
        lists: options,
        shoppingLists: options.map((option) => option.name),
      }
      const next = { ...current, list, pending: [] }
      await saveOfflineSnapshot(next)
      await SecureStore.setItemAsync(activeShoppingListKey(current.householdId), created.id).catch(() => undefined)
      showSnapshot(next)
      setNewListName('')
      setListCreateOpen(false)
    } catch (caught) {
      setError(errorMessage(caught))
      if (caught instanceof MobileApiError && caught.status === 401) handleAuthExpired()
    } finally {
      setListActionBusy(false)
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
          <LoginForm onAuthAction={handleAuthAction} busy={signingIn} error={error} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.header}>
          <View style={styles.nativeHeaderLeft}>
            <Pressable ref={assistantGuideTarget} accessibilityLabel="Otevřít chat s Anitkou" accessibilityRole="button" onPress={() => setAssistantOpen(true)} style={styles.brandMark}>
              <View style={styles.mascotCrop}><Image accessibilityLabel="Anitka" resizeMode="contain" source={require('../assets/anitka-guide-front.webp')} style={styles.mascotImage} /></View>
            </Pressable>
            <Text numberOfLines={1} style={styles.nativeHeaderTitle}>{householdAvailable ? pageTitle : 'Nákup'}</Text>
          </View>
          <View style={styles.nativeHeaderActions}>
            <Pressable ref={notificationGuideTarget} accessibilityLabel={unreadNotificationCount ? `Upozornění, ${unreadNotificationCount} nepřečtených` : 'Upozornění'} accessibilityRole="button" onPress={() => setNotificationsOpen(true)} style={styles.headerIconButton}><Bell color={colors.primary} size={20} />{unreadNotificationCount > 0 ? <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}</Text></View> : null}</Pressable>
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

        <View style={styles.flex}>
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
                onOpenReceipts={(receiptId) => { setShoppingView('receipts'); setActiveTab('shopping'); setFocusedTarget(receiptId ? { kind: 'receipt', id: receiptId } : null) }}
                onQuickExpense={() => { setQuickExpenseToken((current) => current + 1); setActiveTab('budget') }}
                onCheckPantry={() => { setActiveTab('pantry'); setPantryReviewToken((current) => current + 1) }}
                onSelect={setActiveTab}
              />
            ) : activeTab === 'shopping' ? (
              <>
                <View style={styles.sectionSwitcher}>
                  <Pressable accessibilityRole="tab" accessibilityState={{ selected: shoppingView === 'list' }} onPress={() => setShoppingView('list')} style={[styles.sectionTab, shoppingView === 'list' && styles.sectionTabActive]}><Text style={[styles.sectionTabText, shoppingView === 'list' && styles.sectionTabTextActive]}>Nákupní seznam</Text></Pressable>
                  <Pressable accessibilityRole="tab" accessibilityState={{ selected: shoppingView === 'purchases' }} onPress={() => setShoppingView('purchases')} style={[styles.sectionTab, shoppingView === 'purchases' && styles.sectionTabActive]}><Text style={[styles.sectionTabText, shoppingView === 'purchases' && styles.sectionTabTextActive]}>Moje nákupy</Text></Pressable>
                  <Pressable accessibilityRole="tab" accessibilityState={{ selected: shoppingView === 'receipts' }} onPress={() => setShoppingView('receipts')} style={[styles.sectionTab, shoppingView === 'receipts' && styles.sectionTabActive]}><Text style={[styles.sectionTabText, shoppingView === 'receipts' && styles.sectionTabTextActive]}>Účtenky</Text></Pressable>
                </View>
                {shoppingView === 'receipts' ? <ReceiptsScreen focusedReceiptId={focusedTarget?.kind === 'receipt' ? focusedTarget.id : null} onFocusHandled={() => setFocusedTarget(null)} onAuthExpired={handleAuthExpired} onListItemsUpdated={(updated) => {
                  const byId = new Map(updated.map((item) => [item.id, item]))
                  setItems((current) => current.map((item) => byId.has(item.id) ? { ...item, ...byId.get(item.id)! } : item))
                  const current = offlineSnapshot.current
                  if (current) {
                    const next = { ...current, list: { ...current.list, items: current.list.items.map((item) => byId.has(item.id) ? { ...item, ...byId.get(item.id)! } : item) } }
                    void saveOfflineSnapshot(next).then(() => showSnapshot(next))
                  }
                }} /> : shoppingView === 'purchases' ? <NativePurchasesScreen /> : (
                <>
                <View style={styles.listPicker}>
                  <View style={styles.listPickerHeading}>
                    <View style={styles.listPickerTitleWrap}>
                      <Text style={styles.cardEyebrow}>SDÍLENÉ SEZNAMY</Text>
                      <Text numberOfLines={1} style={styles.listPickerTitle}>{listName}</Text>
                    </View>
                    <Pressable accessibilityRole="button" disabled={offline || pendingChanges > 0 || busy || busyItemId !== null || listActionBusy} onPress={() => { setNewListName(''); setError(null); setListCreateOpen(true) }} style={[styles.newListButton, (offline || pendingChanges > 0 || busy || busyItemId !== null || listActionBusy) && styles.disabledButton]}>
                      <Text style={styles.newListButtonText}>＋ Nový</Text>
                    </Pressable>
                  </View>
                  <ScrollView horizontal contentContainerStyle={styles.listPickerChips} showsHorizontalScrollIndicator={false}>
                    {shoppingLists.map((list) => <Pressable key={list.id} accessibilityRole="button" accessibilityState={{ selected: activeListId === list.id, disabled: offline || pendingChanges > 0 || busy || busyItemId !== null || listActionBusy }} disabled={offline || pendingChanges > 0 || busy || busyItemId !== null || listActionBusy} onPress={() => void selectShoppingList(list.id)} style={[styles.listPickerChip, activeListId === list.id && styles.listPickerChipActive]}>
                      <Text numberOfLines={1} style={[styles.listPickerChipText, activeListId === list.id && styles.listPickerChipTextActive]}>{list.name}</Text>
                    </Pressable>)}
                  </ScrollView>
                </View>
                <View style={styles.summary}>
                  <Text style={styles.summaryText}>{remaining} k nákupu · {completed} hotovo</Text>
                  <RefreshButton disabled={busyItemId !== null} loading={busy} onPress={() => void load()} />
                </View>

                <UsualItemsScreen
                  openItemNames={items.filter((item) => !item.done).map((item) => item.name)}
                  disabled={offline || pendingChanges > 0 || busy || busyItemId !== null}
                  listId={activeListId}
                  onAdded={addCatalogProduct}
                  onAuthExpired={handleAuthExpired}
                />

                <View style={styles.addRow}>
                  <TextInput
                    ref={shoppingInputGuideTarget}
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
                <Pressable ref={shoppingToolsGuideTarget} accessibilityRole="button" disabled={offline || busy || busyItemId !== null} onPress={() => setShoppingToolsOpen(true)} style={[styles.scanButton, (offline || busy || busyItemId !== null) && styles.disabledButton]}>
                  <Text style={styles.scanButtonText}>Plán nákupu a hledání produktů</Text>
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
                      <ShoppingRow guideTargetRef={items.find((candidate) => !candidate.done)?.id === item.id ? shoppingItemGuideTarget : undefined} item={item} priceData={priceData} busy={busyItemId === item.id} disabled={busy || busyItemId !== null} onEdit={() => openEdit(item)} onToggle={() => void handleToggle(item)} />
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
                onOpenGuide={() => setGuideOpen(true)}
                guideStepId={guideStepId}
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
                {recipeView === 'meals' ? <MealPlanScreen onAuthExpired={handleAuthExpired} /> : <RecipesScreen onAuthExpired={handleAuthExpired} onAddToShopping={(added) => {
                  const current = offlineSnapshot.current
                  if (!current || added.length === 0) return
                  setActiveTab('shopping')
                  setShoppingView('list')
                  const next = added.reduce((snapshot, item) => ({
                    ...snapshot,
                    pending: enqueueOfflineOperation(snapshot.pending, { kind: 'add', item: { id: createOfflineItemId(), name: item.name, quantity: item.quantity, unit: item.unit, done: false } }),
                  }), current)
                  void saveOfflineSnapshot(next).then(() => { showSnapshot(next); return syncPendingChanges(true) }).catch((caught) => setError(errorMessage(caught)))
                }} />}
              </>
            ) : activeTab === 'budget' ? (
              <BudgetScreen onAuthExpired={handleAuthExpired} quickAddExpenseToken={quickExpenseToken} canManageBudget={householdRole === 'owner'} guideStepId={guideStepId} />
            ) : activeTab === 'pantry' ? (
              <PantryScreen focusedItemId={focusedTarget?.kind === 'pantry-item' ? focusedTarget.id : null} onFocusHandled={() => setFocusedTarget(null)} onAuthExpired={handleAuthExpired} reviewToken={pantryReviewToken} onReviewAddToShopping={addPantryReviewItems} />
            ) : (
              <BudgetScreen onAuthExpired={handleAuthExpired} canManageBudget={householdRole === 'owner'} guideStepId={guideStepId} />
            )}
          </>
        )}
        {householdAvailable && activeTab === 'shopping' && shoppingView === 'list' && completed > 0 ? <View style={styles.completeShoppingBar}>
          <Pressable
            ref={shoppingFinishGuideTarget}
            accessibilityRole="button"
            accessibilityState={{ disabled: offline || pendingChanges > 0 || busy || busyItemId !== null }}
            disabled={offline || pendingChanges > 0 || busy || busyItemId !== null}
            onPress={() => void handleClearDoneItems()}
            style={[styles.completeShoppingButton, (offline || pendingChanges > 0 || busy || busyItemId !== null) && styles.disabledButton]}
          >
            <Text style={styles.completeShoppingText}>{busyItemId === 'clear-done' ? 'Dokončuji…' : `✓  Dokončit nákup (${completed})`}</Text>
          </Pressable>
        </View> : null}
        </View>
        {householdAvailable ? <NativeBottomNav active={activeTab} onSelect={setActiveTab} guideTargetRefs={{ home: homeNavGuideTarget, shopping: shoppingNavGuideTarget, pantry: pantryNavGuideTarget, budget: budgetNavGuideTarget, more: moreGuideTarget }} /> : null}
      </KeyboardAvoidingView>
      <NativeAssistantModal onClose={() => setAssistantOpen(false)} onShopping={() => setActiveTab('shopping')} visible={assistantOpen} />
      <NativeGuideModal onClose={() => { setGuideOpen(false); setGuideStepId(null); void SecureStore.setItemAsync(GUIDE_DONE_KEY, 'done').catch(() => undefined) }} onNavigate={navigateGuide} visible={guideOpen} />
      <NativeNotificationsModal onClose={() => setNotificationsOpen(false)} onUnreadCount={setUnreadNotificationCount} visible={notificationsOpen} />
      <ShoppingToolsModal guideStepId={guideStepId} items={items} listId={activeListId} onAuthExpired={handleAuthExpired} onClose={() => setShoppingToolsOpen(false)} onProductAdded={addCatalogProduct} visible={shoppingToolsOpen} />
      <Modal animationType="slide" onRequestClose={() => { if (!listActionBusy) setListCreateOpen(false) }} transparent visible={listCreateOpen}>
        <View style={styles.modalBackdrop}>
          <View style={styles.editor}>
            <View style={styles.editorHeading}>
              <Text style={styles.editorTitle}>Nový sdílený seznam</Text>
              <Pressable accessibilityLabel="Zavřít nový seznam" accessibilityRole="button" disabled={listActionBusy} onPress={() => setListCreateOpen(false)} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable>
            </View>
            <Text style={styles.supporting}>Seznam uvidí všichni členové domácnosti.</Text>
            <TextInput autoFocus accessibilityLabel="Název nového seznamu" autoCorrect={false} maxLength={80} onChangeText={setNewListName} onSubmitEditing={() => void submitNewShoppingList()} placeholder="Např. Týdenní nákup" placeholderTextColor={colors.mutedText} returnKeyType="done" style={styles.input} value={newListName} />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" disabled={listActionBusy} onPress={() => setListCreateOpen(false)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Zrušit</Text></Pressable>
              <PrimaryButton disabled={listActionBusy || !newListName.trim()} label={listActionBusy ? 'Vytvářím…' : 'Vytvořit'} onPress={() => void submitNewShoppingList()} />
            </View>
          </View>
        </View>
      </Modal>
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
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.navyOverlay },
  editor: { gap: 12, backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 28 },
  editorHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  editorTitle: { flex: 1, color: colors.foreground, fontSize: 18, fontWeight: '700' },
  closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.muted },
  closeText: { color: colors.secondaryText, fontSize: 24, lineHeight: 28 },
  cardEyebrow: { color: colors.mutedText, fontSize: 10, fontWeight: '700', letterSpacing: 0.9 },
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
  listPicker: { gap: 8, marginHorizontal: 16, marginTop: 6, marginBottom: 4, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card },
  listPickerHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  listPickerTitleWrap: { flex: 1, minWidth: 0, gap: 2 },
  listPickerTitle: { color: colors.foreground, fontSize: 15, fontWeight: '700' },
  newListButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 11, backgroundColor: colors.accentSubtle },
  newListButtonText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
  listPickerChips: { gap: 7, paddingRight: 4 },
  listPickerChip: { maxWidth: 190, minHeight: 34, justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: colors.muted },
  listPickerChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSubtle },
  listPickerChipText: { color: colors.secondaryText, fontSize: 12, fontWeight: '600' },
  listPickerChipTextActive: { color: colors.accentText, fontWeight: '700' },
  completeShoppingBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, borderTopColor: colors.border, borderTopWidth: 1, backgroundColor: colors.background },
  completeShoppingButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.accent },
  completeShoppingText: { color: '#0a1a3f', fontSize: 16, fontWeight: '700' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  scanButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginBottom: 12, borderColor: colors.inputBorder, borderRadius: 12, borderWidth: 1, backgroundColor: colors.card },
  scanButtonText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  addInput: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  itemRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 12, gap: 12 },
  shoppingRowGroup: { gap: 5 },
  priceToggle: { minHeight: 34, alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 8, borderRadius: 10, backgroundColor: colors.accentSubtle },
  priceToggleText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
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
