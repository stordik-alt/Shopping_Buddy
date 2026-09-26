'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addExpenseAction, deleteExpenseAction, setCategoryBudgetAction, updateExpenseAction } from '@/app/actions/budget'
import { confirmRecurringPaymentAction, saveRecurringPaymentAction, skipRecurringPaymentAction, stopRecurringPaymentAction } from '@/app/actions/recurring'
import { buildShoppingPlanAction, pinProductAction, unpinProductAction } from '@/app/actions/shopping-plan'
import { saveMyStorePreferencesAction } from '@/app/actions/store-preferences'
import {
  addChildAction,
  addHouseholdMemberAction,
  inviteMemberAction,
  removeChildAction,
  removeHouseholdMemberAction,
  revokeInvitationAction,
  updateHouseholdAction,
  updateHouseholdPreferencesAction,
} from '@/app/actions/household'
import { markMealCookedAction } from '@/app/actions/meal-plan'
import { markAllNotificationsReadAction, markNotificationReadAction } from '@/app/actions/notifications'
import { adjustPantryItemQuantityAction, confirmPantryItemAction, movePantryItemAction, removePantryItemAction, reviewPantryAction, setPantryTrackingAction } from '@/app/actions/pantry'
import { completePurchaseAction } from '@/app/actions/purchases'
import {
  applyReceiptListMatchesAction,
  cancelReceiptImportAction,
  confirmReceiptReviewAction,
  getReceiptListSuggestionsAction,
  importReceiptAction,
  processUploadedReceiptAction,
  resolveDuplicateReceiptAction,
  retryReceiptImportAction,
  uploadReceiptAction,
} from '@/app/actions/receipts'
import { addShoppingItemAction, addShoppingListAction, removeShoppingItemAction, toggleShoppingItemAction, updateShoppingItemAction } from '@/app/actions/shopping'
import { AiAssistant } from '@/components/ai/ai-assistant'
import { BudgetOverview } from '@/components/budget/budget-overview'
import { CategoryLimitsModal } from '@/components/budget/category-limits-modal'
import { RecurringPaymentModal } from '@/components/budget/recurring-payment-modal'
import { RecurringPayments } from '@/components/budget/recurring-payments'
import { ExpenseLedger } from '@/components/budget/expense-ledger'
import { ExpenseModal } from '@/components/budget/expense-modal'
import { PurchaseHistory } from '@/components/budget/purchase-history'
import { ReceiptImport } from '@/components/budget/receipt-import'
import { ReceiptListSuggestions } from '@/components/budget/receipt-list-suggestions'
import { ReceiptPending } from '@/components/budget/receipt-pending'
import { DashboardOverview } from '@/components/dashboard/dashboard-overview'
import { MealPlan } from '@/components/dashboard/meal-plan'
import { PriceWatch } from '@/components/dashboard/price-watch'
import { SavingsInsight } from '@/components/dashboard/savings-insight'
import { SpendingBreakdown } from '@/components/dashboard/spending-breakdown'
import { TodayAttention } from '@/components/dashboard/today-attention'
import { HouseholdProfile } from '@/components/household/household-profile'
import { NotificationPanel } from '@/components/notifications/notification-panel'
import { AppHeader } from '@/components/shared/app-header'
import { AppSidebar } from '@/components/shared/app-sidebar'
import { MobileNav } from '@/components/shared/mobile-nav'
import { Pantry } from '@/components/shopping/pantry'
import { OfflineBanner } from '@/components/shopping/offline-banner'
import { QuickOutOfStock } from '@/components/dashboard/quick-out-of-stock'
import { PantryPrompt, type PantryPromptState } from '@/components/shopping/pantry-prompt'
import { applyPendingOps, enqueue, isNetworkError, loadQueue, newTempId, placeholderItem, remapItemId, saveQueue, type PendingOp } from '@/lib/offline-queue'
import { estimatePantry } from '@/lib/pantry-estimate'
import { pantryItemAtHome } from '@/lib/pantry'
import { matchKey as matchKeyOf } from '@/lib/receipt-list-match'
import { ShoppingList } from '@/components/shopping/shopping-list'
import { StoreDirectory } from '@/components/stores/store-directory'
import { UsualItems } from '@/components/shopping/usual-items'
import { expensesInMonth, totalSpent } from '@/lib/budget'
import { longDate } from '@/lib/format'
import type { HouseholdData, ReceiptImportState } from '@/lib/db/queries'
import type { ReceiptListSuggestion } from '@/lib/db/receipt-list'
import type { Ingredient, MealType } from '@/lib/meal-plans'
import type { ProductPrice } from '@/lib/prices'
import { pollReceiptStatus } from '@/lib/receipt-progress'
import type { ReceiptLineItem } from '@/lib/receipts'
import type { ExpenseCategory } from '@/lib/expense-categories'
import type { ExpenseInput } from '@/lib/expense-input'
import type { RecurringPayment, RecurringPaymentInput } from '@/lib/recurring-payments'
import type { Expense, Item, PantryItem, PantryLocation, PantryTracking, Store, Tab } from '@/lib/types'
import type { PinRecord } from '@/lib/db/shopping-plan'
import { filterPricesToNearby, type StoreSelection } from '@/lib/nearby-stores'
import { nearbyOffers, type StandaloneOffer } from '@/lib/offers'
import { useUserLocation } from '@/lib/use-user-location'
import { attentionItems } from '@/lib/attention'
import { AI_ASSISTANT_ENABLED } from '@/lib/features'
import { tabFromSlug, tabHref } from '@/lib/tab-url'
import { suggestUsualItems, type UsualItem } from '@/lib/usual-items'
import { safeLocalStorage } from '@/lib/safe-storage'
import { readThemeChoice, resolveDark, saveThemeChoice } from '@/lib/theme-preference'

export function AppShell({
  initialData,
  userName,
  stores,
  productPrices,
  standaloneOffers,
  storeChains,
  initialStoreSelection,
  initialPins,
  today,
  initialTab,
  initialPantryCheck = false,
  pushPublicKey,
}: {
  initialData: HouseholdData
  userName: string
  stores: Store[]
  productPrices: ProductPrice[]
  /** Offers at stores for products with no regular price to compare against (lib/offers.ts). */
  standaloneOffers: StandaloneOffer[]
  storeChains: { id: string; chain: string; isOnline?: boolean }[]
  initialStoreSelection: StoreSelection
  initialPins: PinRecord[]
  /** The real date (`YYYY-MM-DD`, Czech time) computed on the server, so server and client agree. */
  today: string
  /** The section named in the address (`/?tab=…`, lib/tab-url.ts), resolved on the server. */
  initialTab: Tab
  /** Open the pantry check right away (`/?tab=zasoby&kontrola=1`, the weekly notification's link). */
  initialPantryCheck?: boolean
  /** The server's Web Push key; null when push notifications are not configured (lib/push/). */
  pushPublicKey: string | null
}) {
  const [tab, setTabState] = useState<Tab>(initialTab)
  // Chain whose promotions the home screen lists after "Zobrazit akce" in the store directory.
  const [dealsChain, setDealsChain] = useState<string | null>(null)
  // Switching sections records the section in the address, so the phone's back gesture returns to
  // the previous section instead of closing the app, and a reload stays where the user was.
  const setTab = useCallback((next: Tab) => {
    setTabState(next)
    const href = tabHref(next)
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.pushState(null, '', href)
  }, [])
  useEffect(() => {
    const onPopState = () =>
      setTabState(tabFromSlug(new URLSearchParams(window.location.search).get('tab'), { aiEnabled: AI_ASSISTANT_ENABLED }))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  // The user's own "stores in my area". Until every branch has GPS, this selection decides which
  // stores' prices are compared and planned with (lib/nearby-stores.ts); nothing chosen = all stores.
  const [storeSelection, setStoreSelection] = useState(initialStoreSelection)
  // The products the user pinned to list items, per chain (the shopping planner buys exactly those).
  const [pins, setPins] = useState(initialPins)
  const nearbyProductPrices = useMemo(() => filterPricesToNearby(productPrices, storeSelection), [productPrices, storeSelection])
  const nearbyStandaloneOffers = useMemo(() => nearbyOffers(standaloneOffers, storeSelection), [standaloneOffers, storeSelection])
  const [household, setHousehold] = useState(initialData.household)
  const [items, setItems] = useState(initialData.items)
  // Starts light on the server render; the effect below applies the remembered choice or the
  // system setting right after hydration (lib/theme-preference.ts).
  const [dark, setDark] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  // The expense being corrected in the modal; null while adding a new one.
  const [editedExpense, setEditedExpense] = useState<Expense | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialData.notifications)
  const [expenses, setExpenses] = useState(initialData.expenses)
  const [categoryBudgets, setCategoryBudgets] = useState(initialData.categoryBudgets)
  const [limitsOpen, setLimitsOpen] = useState(false)
  const [recurringPayments, setRecurringPayments] = useState(initialData.recurringPayments)
  const [recurringOccurrences, setRecurringOccurrences] = useState(initialData.recurringOccurrences)
  // The recurring payment being changed in its modal; 'new' while adding one, null while closed.
  const [recurringEdit, setRecurringEdit] = useState<RecurringPayment | 'new' | null>(null)
  const [newItem, setNewItem] = useState('')
  // Plausible receipt ↔ shopping-list matches waiting for the household to confirm (certain ones were
  // ticked on the server already).
  const [listSuggestions, setListSuggestions] = useState<{ purchaseId: string; items: ReceiptListSuggestion[] } | null>(null)
  const [shoppingLists, setShoppingLists] = useState(initialData.shoppingLists)
  const [pendingInvitations, setPendingInvitations] = useState(initialData.pendingInvitations)
  const [pantryItems, setPantryItems] = useState(initialData.pantryItems)
  const [pendingReceiptImports, setPendingReceiptImports] = useState(initialData.pendingReceiptImports)
  const router = useRouter()
  const userLocation = useUserLocation()

  // Shared households (Phase B "concurrent edits"): initialData comes from a Server Component
  // fetch, so another member's changes only reach this client on the next server re-render.
  // Resync local state whenever a fresh initialData arrives, and trigger that re-render
  // periodically and when the tab regains focus — good-enough freshness without websockets.
  useEffect(() => {
    setHousehold(initialData.household)
    // Changes still waiting for a connection stay visible on top of the server's copy.
    setItems(applyPendingOps(initialData.items, queueRef.current))
    setNotifications(initialData.notifications)
    setExpenses(initialData.expenses)
    setCategoryBudgets(initialData.categoryBudgets)
    setRecurringPayments(initialData.recurringPayments)
    setRecurringOccurrences(initialData.recurringOccurrences)
    setShoppingLists(initialData.shoppingLists)
    setPendingInvitations(initialData.pendingInvitations)
    setPantryItems(initialData.pantryItems)
    setPendingReceiptImports(initialData.pendingReceiptImports)
  }, [initialData])

  useEffect(() => {
    const storage = safeLocalStorage()
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    setDark(resolveDark(readThemeChoice(storage), media.matches))
    // Follow the system setting live, but only while the user has not chosen explicitly.
    const onSystemChange = (event: MediaQueryListEvent) => {
      if (readThemeChoice(safeLocalStorage()) === null) setDark(event.matches)
    }
    media.addEventListener('change', onSystemChange)
    return () => media.removeEventListener('change', onSystemChange)
  }, [])

  function toggleDark() {
    const next = !dark
    setDark(next)
    saveThemeChoice(safeLocalStorage(), next ? 'dark' : 'light')
  }

  // Picks up what other household members changed (lightweight polling, no realtime — CLAUDE.md
  // section 10). Every refresh re-renders the page on the server, so it runs only while the app is
  // on screen and once a minute: the earlier 20-second refresh, running even in a background tab,
  // was the main part of the traffic that used up Neon's monthly network transfer. Coming back to
  // the app refreshes at once.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      // Waiting offline changes go first; the flush refreshes when it is done.
      if (queueRef.current.length > 0) void flushQueue()
      else router.refresh()
    }, 60_000)
    const onFocus = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [router])

  // The service worker (public/sw.js) keeps the last loaded page so the app opens without a signal,
  // and shows push notifications. Registered for everyone; push itself still needs the member's
  // permission (components/notifications/push-toggle.tsx).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch((error) => console.error('Service worker registration failed', error))
  }, [])

  // The service worker tells open windows when a notification arrives, so the bell panel shows it at
  // once instead of on the next poll.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'push-received') router.refresh()
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [router])

  const budget = household.monthlyBudget
  // The budget is monthly: only this calendar month's expenses count against it.
  const monthExpenses = useMemo(() => expensesInMonth(expenses, today), [expenses, today])
  const spent = totalSpent(monthExpenses)
  const remaining = budget - spent
  const completed = items.filter((item) => item.done).length

  const firstName = userName.trim().split(/\s+/)[0] || userName
  const title = tab === 'Domů' ? `Ahoj, ${firstName}` : tab
  const dateLabel = longDate(today)
  const unreadCount = notifications.filter((notification) => notification.unread).length
  const pendingNames = items.filter((item) => !item.done).map((item) => item.name)
  // Regular purchases that are due again and not on the list or in the pantry (lib/usual-items.ts).
  const usualItems = useMemo(
    () =>
      suggestUsualItems({
        purchases: initialData.purchaseHistory,
        today,
        onList: items.filter((item) => !item.done).map((item) => item.name),
        inPantry: pantryItems.map((item) => item.name),
      }),
    [initialData.purchaseHistory, today, items, pantryItems],
  )

  async function addItem() {
    const name = newItem.trim()
    if (!name) return
    setNewItem('')
    await addItemByName(name)
  }

  // Shared by the "Co koupit?" field and the deals card's "Na seznam" button.
  async function addItemByName(name: string) {
    offerPantryCorrection(name)
    await runOrQueue({ kind: 'add', tempId: newTempId(), name })
  }

  // Putting something on the list that the pantry says is at home: ask once whether it ran out
  // (components/shopping/pantry-prompt.tsx). Matched by name with synonyms (matchKey); items the
  // household does not track are left alone.
  const [pantryPrompt, setPantryPrompt] = useState<PantryPromptState | null>(null)
  function offerPantryCorrection(name: string) {
    const atHome = pantryItemAtHome(pantryItems, name)
    setPantryPrompt(atHome ? { pantryItemId: atHome.id, name: atHome.name, quantity: atHome.quantity, unit: atHome.unit } : null)
  }

  // Sequential on purpose — was Promise.all, which fired one addShoppingItemAction per ingredient
  // concurrently. Each call ends in its own revalidatePath('/'), and with a dozen-plus in flight
  // at once (routine now that a stock-aware meal plan's "toBuy" list can run to 20-30 items), the
  // client can end up applying a stale mid-batch server snapshot over the correct optimistic
  // state, leaving the shopping list looking empty until a hard reload even though every insert
  // actually succeeded. Awaiting one at a time keeps at most one revalidation in flight.
  async function addIngredients(ingredients: Ingredient[]) {
    setTab('Nákup')
    for (const ingredient of ingredients) {
      const { item, notification } = await addShoppingItemAction(initialData.mainListId, ingredient.name, {
        detail: `${ingredient.quantity} ${ingredient.unit} · z jídelníčku`,
        category: ingredient.category,
        unit: ingredient.unit,
      })
      setItems((current) => [...current, item])
      if (notification) setNotifications((current) => [...current, notification])
    }
  }

  // Sequential for the same reason as addIngredients above: one revalidation in flight at a time.
  async function addUsualItems(usual: UsualItem[]) {
    for (const entry of usual) {
      const { item, notification } = await addShoppingItemAction(initialData.mainListId, entry.name, {
        detail: `${entry.quantity} ${entry.unit} · obvyklý nákup`,
        unit: entry.unit,
      })
      setItems((current) => [...current, item])
      if (notification) setNotifications((current) => [...current, notification])
    }
  }

  function updateItem(id: string, changes: Partial<Item>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)))
    void runOrQueue({ kind: 'update', itemId: id, changes })
  }

  function toggleItem(id: string) {
    const next = !items.find((item) => item.id === id)?.done
    setItems((current) => current.map((item) => (item.id === id ? { ...item, done: next } : item)))
    void runOrQueue({ kind: 'toggle', itemId: id, done: next })
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id))
    void runOrQueue({ kind: 'remove', itemId: id })
  }

  // --- Shopping list without a signal (lib/offline-queue.ts) ---------------------------------
  // List changes are sent at once when there is a connection. Without one — or while earlier changes
  // still wait — they join a queue stored on the device, stay visible on top of the server's copy,
  // and are sent in order when the connection returns. A change the server refuses (the item was
  // removed by another member meanwhile) is dropped and reported; a lost connection keeps the rest.
  const queueRef = useRef<PendingOp[]>([])
  const flushingRef = useRef(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [online, setOnline] = useState(true)
  const [droppedCount, setDroppedCount] = useState(0)

  const setQueue = useCallback(
    (ops: PendingOp[]) => {
      queueRef.current = ops
      saveQueue(safeLocalStorage(), initialData.household.id, ops)
      setPendingCount(ops.length)
    },
    [initialData.household.id],
  )

  // Sends one change; an offline-added item gets its real id from the server here.
  async function sendOp(op: PendingOp) {
    switch (op.kind) {
      case 'add': {
        const { item, notification } = await addShoppingItemAction(initialData.mainListId, op.name)
        setItems((current) => (current.some((entry) => entry.id === op.tempId) ? current.map((entry) => (entry.id === op.tempId ? item : entry)) : [...current, item]))
        queueRef.current = remapItemId(queueRef.current, op.tempId, item.id)
        if (notification) setNotifications((current) => [...current, notification])
        return
      }
      case 'toggle':
        return toggleShoppingItemAction(op.itemId, op.done)
      case 'update':
        return updateShoppingItemAction(op.itemId, op.changes)
      case 'remove':
        return removeShoppingItemAction(op.itemId)
    }
  }

  async function runOrQueue(op: PendingOp) {
    const queueIt = () => {
      if (op.kind === 'add') setItems((current) => [...current, placeholderItem(op.tempId, op.name)])
      setQueue(enqueue(queueRef.current, op))
    }
    // Behind earlier waiting changes, a new one waits too, so the server sees them in order.
    if (queueRef.current.length > 0 || !navigator.onLine) return queueIt()
    try {
      await sendOp(op)
    } catch (error) {
      if (isNetworkError(error, navigator.onLine)) return queueIt()
      console.error('Shopping list change refused', error)
      setDroppedCount((count) => count + 1)
    }
  }

  const flushQueue = useCallback(async () => {
    if (flushingRef.current || queueRef.current.length === 0 || !navigator.onLine) return
    flushingRef.current = true
    try {
      while (queueRef.current.length > 0) {
        const [op] = queueRef.current
        try {
          await sendOp(op)
        } catch (error) {
          if (isNetworkError(error, navigator.onLine)) return // still offline: keep the rest for later
          console.error('Queued shopping list change refused', error)
          setDroppedCount((count) => count + 1)
        }
        setQueue(queueRef.current.slice(1))
      }
      router.refresh()
    } finally {
      flushingRef.current = false
    }
    // sendOp only uses stable values and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, setQueue])

  useEffect(() => {
    // Restore what was left waiting on this device, and show it on top of the server's copy.
    const stored = loadQueue(safeLocalStorage(), initialData.household.id)
    if (stored.length > 0) {
      queueRef.current = stored
      setPendingCount(stored.length)
      setItems((current) => applyPendingOps(current, stored))
    }
    setOnline(navigator.onLine)
    const goOnline = () => {
      setOnline(true)
      void flushQueue()
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    void flushQueue()
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [initialData.household.id, flushQueue])

  async function completePurchase() {
    const doneIds = new Set(items.filter((item) => item.done).map((item) => item.id))
    if (doneIds.size === 0) return
    // The server completes what it knows is ticked, so waiting ticks go first; without a connection
    // the purchase waits (nothing is lost — the ticks stay queued).
    if (!navigator.onLine) return
    await flushQueue()
    if (queueRef.current.length > 0) return
    const { purchases } = await completePurchaseAction(initialData.mainListId)
    if (purchases.length === 0) return
    setItems((current) => current.filter((item) => !doneIds.has(item.id)))
    router.refresh() // picks up the new purchase-history entries on the next server render
  }

  function addShoppingListName(name: string) {
    setShoppingLists((current) => [...current, name])
    addShoppingListAction(name)
  }

  function updateHousehold(changes: { name?: string; monthlyBudget?: number }) {
    setHousehold((current) => ({ ...current, ...changes }))
    updateHouseholdAction(changes)
  }

  async function addMember(member: { name: string; age: number; favoriteFoods: string[]; dislikedFoods: string[]; allergies: string[] }) {
    const created = await addHouseholdMemberAction(member)
    setHousehold((current) => ({ ...current, members: [...current.members, created] }))
  }

  function removeMember(id: string) {
    setHousehold((current) => ({ ...current, members: current.members.filter((member) => member.id !== id) }))
    removeHouseholdMemberAction(id)
  }

  async function addChild(child: { name: string; age: number; preferences: string; specialNeeds?: string }) {
    const created = await addChildAction(child)
    setHousehold((current) => ({ ...current, children: [...current.children, created] }))
  }

  function removeChild(id: string) {
    setHousehold((current) => ({ ...current, children: current.children.filter((child) => child.id !== id) }))
    removeChildAction(id)
  }

  async function pinProduct(itemId: string, storeId: string, productId: string) {
    await pinProductAction({ itemId, storeId, productId })
    setPins((current) => [...current.filter((pin) => !(pin.itemId === itemId && pin.storeId === storeId)), { itemId, storeId, productId }])
  }

  async function unpinProduct(itemId: string, storeId: string) {
    await unpinProductAction({ itemId, storeId })
    setPins((current) => current.filter((pin) => !(pin.itemId === itemId && pin.storeId === storeId)))
  }

  async function saveStorePreferences(input: { maxDistanceKm: number | null; chainIds: string[]; locationIds: string[]; priorityChainIds: string[]; maxShopStores: number | null }) {
    const saved = await saveMyStorePreferencesAction(input)
    setStoreSelection(saved)
    return saved
  }

  function updatePreferences(changes: Partial<typeof household.preferences>) {
    setHousehold((current) => ({ ...current, preferences: { ...current.preferences, ...changes } }))
    updateHouseholdPreferencesAction(changes)
  }

  async function inviteMember(email: string) {
    const invitation = await inviteMemberAction(email)
    setPendingInvitations((current) => [...current, { id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt }])
    return invitation
  }

  function revokeInvitation(id: string) {
    setPendingInvitations((current) => current.filter((invitation) => invitation.id !== id))
    revokeInvitationAction(id)
  }

  function confirmPantryItem(id: string) {
    setPantryItems((current) => current.map((item) => (item.id === id ? { ...item, addedAt: new Date().toISOString(), askedAt: undefined } : item)))
    confirmPantryItemAction(id)
  }

  function removePantryItem(id: string) {
    setPantryItems((current) => current.filter((item) => item.id !== id))
    removePantryItemAction(id)
  }

  function movePantryItem(id: string, location: PantryLocation) {
    setPantryItems((current) => current.map((item) => (item.id === id ? { ...item, location } : item)))
    movePantryItemAction(id, location)
  }

  // Bulk check (components/shopping/pantry-review.tsx). Saved first; the local pantry changes only
  // once the server accepted it, so a failed save leaves everything as it was. Items that ran out
  // are then added to the list one at a time (see addIngredients for why not in parallel), skipping
  // names already waiting on the list.
  async function reviewPantry(reviewedIds: string[], goneIds: string[], addGoneToList: boolean) {
    const result = await reviewPantryAction({ reviewedIds, goneIds })
    const gone = new Set(goneIds)
    const kept = new Set(reviewedIds.filter((id) => !gone.has(id)))
    const goneItems = pantryItems.filter((item) => gone.has(item.id))
    const now = new Date().toISOString()
    setPantryItems((current) => current.filter((item) => !gone.has(item.id)).map((item) => (kept.has(item.id) ? { ...item, addedAt: now, askedAt: undefined } : item)))

    // The check is saved at this point; a failure while adding to the list is reported as such.
    let addedToList = 0
    let listFailed = false
    if (addGoneToList) {
      const onList = new Set(items.filter((item) => !item.done).map((item) => item.name.trim().toLowerCase()))
      try {
        for (const pantryItem of goneItems) {
          const key = pantryItem.name.trim().toLowerCase()
          if (onList.has(key)) continue
          onList.add(key)
          const { item, notification } = await addShoppingItemAction(initialData.mainListId, pantryItem.name, { category: pantryItem.category, unit: pantryItem.unit, detail: 'došlo ze zásob' })
          setItems((current) => [...current, item])
          if (notification) setNotifications((current) => [...current, notification])
          addedToList += 1
        }
      } catch (error) {
        console.error('Adding pantry items to the shopping list failed', error)
        listFailed = true
      }
    }
    return { ...result, addedToList, listFailed }
  }

  // "Asi došlo" estimates from the household's own purchase rhythm (lib/pantry-estimate.ts).
  const pantryEstimates = useMemo(() => estimatePantry(pantryItems, initialData.purchaseHistory, today), [pantryItems, initialData.purchaseHistory, today])
  const likelyGonePantryIds = useMemo(() => new Set([...pantryEstimates].filter(([, estimate]) => estimate.likelyGone).map(([id]) => id)), [pantryEstimates])
  // "Došlo mi…" on the home screen: out of the pantry and, if asked, onto the list — without the
  // "Došlo?" question, since the household just said so.
  function quickOut(item: PantryItem, addToList: boolean) {
    removePantryItem(item.id)
    if (addToList && !items.some((entry) => !entry.done && matchKeyOf(entry.name) === matchKeyOf(item.name))) void runOrQueue({ kind: 'add', tempId: newTempId(), name: item.name })
  }
  const [pantryCheckPending, setPantryCheckPending] = useState(initialPantryCheck)
  // Consumes the check link: drops `kontrola=1` from the address so a reload does not reopen it.
  const consumePantryCheck = useCallback(() => {
    setPantryCheckPending(false)
    if (new URLSearchParams(window.location.search).has('kontrola')) window.history.replaceState(null, '', tabHref('Zásoby'))
  }, [])

  function setPantryTracking(id: string, tracking: PantryTracking) {
    setPantryItems((current) => current.map((item) => (item.id === id ? { ...item, tracking, askedAt: undefined } : item)))
    setPantryTrackingAction(id, tracking)
  }

  function adjustPantryItemQuantity(id: string, quantity: number) {
    setPantryItems((current) => current.map((item) => (item.id === id ? { ...item, quantity } : item)))
    adjustPantryItemQuantityAction(id, quantity)
  }

  function markMealCooked(day: string, mealType: MealType) {
    markMealCookedAction(day, mealType)
    router.refresh() // picks up the pantry deduction the server action just made
  }

  /** Asks the server which open shopping-list items a just-imported purchase plausibly covers. The
   *  import itself has already succeeded, so a failure here is logged rather than shown as an import
   *  error; the household can still tick the items by hand. */
  async function offerListMatches(purchaseId: string | null | undefined) {
    if (!purchaseId) return
    try {
      const suggestions = await getReceiptListSuggestionsAction(purchaseId)
      setListSuggestions(suggestions.length > 0 ? { purchaseId, items: suggestions } : null)
    } catch (error) {
      console.error('Could not load shopping-list suggestions for the receipt', error)
    }
  }

  async function confirmListSuggestions(selected: ReceiptListSuggestion[]) {
    if (!listSuggestions) return
    await applyReceiptListMatchesAction(
      listSuggestions.purchaseId,
      selected.map((suggestion) => ({ listItemId: suggestion.listItemId, purchaseItemId: suggestion.purchaseItemId })),
    )
    setListSuggestions(null)
    router.refresh() // the list shows the newly ticked items with their real price and quantity
  }

  async function importReceipt(items: ReceiptLineItem[], options: { date?: string; storeLocationId?: string }) {
    const { purchase } = await importReceiptAction(items, options)
    router.refresh() // picks up the new purchase-history entry and restocked pantry
    await offerListMatches(purchase.id)
  }

  function upsertPendingReceipt(result: ReceiptImportState) {
    setPendingReceiptImports((current) => {
      const withoutThis = current.filter((r) => r.id !== result.id)
      const stillPending = result.status !== 'completed' && result.status !== 'cancelled'
      return stillPending ? [...withoutThis, result] : withoutThis
    })
  }

  /** Two calls so the import id is known while the pipeline runs: upload stores the photo, then
   *  processing runs the whole OCR pipeline in one request. While that request is in flight, the
   *  status route is polled (a route handler, not an action — Next runs one client's actions
   *  sequentially, so an action would queue behind the processing call) to report the real stage. */
  async function uploadReceipt(file: File, onProgress: (status: string) => void) {
    onProgress('uploading')
    const formData = new FormData()
    formData.set('file', file)
    const upload = await uploadReceiptAction(formData)
    if (!upload.ok) throw new Error(upload.error)
    const uploaded = upload.receipt
    onProgress(uploaded.status)
    const stopPolling = pollReceiptStatus(uploaded.id, onProgress)
    try {
      const result = await processUploadedReceiptAction(uploaded.id)
      upsertPendingReceipt(result)
      router.refresh() // picks up a new purchase/pantry restock if it completed outright
      await offerListMatches(result.purchaseId)
      return result
    } finally {
      stopPolling()
    }
  }

  async function retryReceiptImport(id: string) {
    const result = await retryReceiptImportAction(id)
    upsertPendingReceipt(result)
    router.refresh()
    await offerListMatches(result.purchaseId)
    return result
  }

  async function confirmReceiptReview(id: string, items: ReceiptLineItem[], date: string) {
    const { purchase } = await confirmReceiptReviewAction(id, items, { date })
    setPendingReceiptImports((current) => current.filter((r) => r.id !== id))
    router.refresh()
    await offerListMatches(purchase.id)
  }

  async function resolveDuplicateReceipt(id: string, resolution: 'save_new' | 'use_existing' | 'cancel', items?: ReceiptLineItem[], date?: string) {
    const { purchase } = await resolveDuplicateReceiptAction(id, resolution, items, { date })
    setPendingReceiptImports((current) => current.filter((r) => r.id !== id))
    router.refresh()
    await offerListMatches(purchase?.id)
  }

  function cancelReceiptImport(id: string) {
    setPendingReceiptImports((current) => current.filter((r) => r.id !== id))
    cancelReceiptImportAction(id)
  }

  function readNotification(id: string) {
    setNotifications((current) => current.map((notification) => (notification.id === id ? { ...notification, unread: false } : notification)))
    markNotificationReadAction(id)
  }

  function readAllNotifications() {
    setNotifications((current) => current.map((notification) => ({ ...notification, unread: false })))
    markAllNotificationsReadAction()
  }

  function openExpense(expense: Expense | null) {
    setEditedExpense(expense)
    setExpenseOpen(true)
  }

  function closeExpense() {
    setExpenseOpen(false)
    setEditedExpense(null)
  }

  // Kept in date order, as the server loads them, so the monthly numbers read the same after a save.
  const byDate = (list: Expense[]) => list.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  async function saveExpense(input: ExpenseInput) {
    if (editedExpense) {
      const { expense } = await updateExpenseAction(editedExpense.id, input)
      setExpenses((current) => byDate(current.map((entry) => (entry.id === expense.id ? expense : entry))))
    } else {
      const { expense, notifications: created } = await addExpenseAction(input)
      setExpenses((current) => byDate([...current, expense]))
      if (created.length > 0) setNotifications((current) => [...current, ...created])
    }
    closeExpense()
  }

  /** Saves the changed limits one by one; the last answer holds every limit of the household. */
  async function saveLimits(changes: { category: ExpenseCategory; amount: number | null }[]) {
    let latest = categoryBudgets
    for (const change of changes) latest = await setCategoryBudgetAction(change.category, change.amount)
    setCategoryBudgets(latest)
    setLimitsOpen(false)
  }

  async function saveRecurring(input: RecurringPaymentInput) {
    const editing = recurringEdit !== 'new' && recurringEdit ? recurringEdit : null
    const saved = await saveRecurringPaymentAction(input, editing?.id)
    setRecurringPayments((current) =>
      (editing ? current.map((entry) => (entry.id === saved.id ? saved : entry)) : [...current, saved]).sort((a, b) => a.name.localeCompare(b.name, 'cs')),
    )
    setRecurringEdit(null)
  }

  async function stopRecurring() {
    if (!recurringEdit || recurringEdit === 'new') return
    await stopRecurringPaymentAction(recurringEdit.id)
    const stopped = recurringEdit.id
    setRecurringPayments((current) => current.filter((entry) => entry.id !== stopped))
    setRecurringEdit(null)
  }

  /** A due date paid: it becomes an expense, and may cross a budget threshold. */
  async function confirmRecurring(paymentId: string, dueDate: string, paid: { amount: number; date: string }) {
    const { expense, occurrence, notifications: created } = await confirmRecurringPaymentAction(paymentId, dueDate, paid)
    setRecurringOccurrences((current) => [...current, occurrence])
    setExpenses((current) => byDate([...current, expense]))
    if (created.length > 0) setNotifications((current) => [...current, ...created])
  }

  async function skipRecurring(paymentId: string, dueDate: string) {
    const occurrence = await skipRecurringPaymentAction(paymentId, dueDate)
    setRecurringOccurrences((current) => [...current, occurrence])
  }

  async function deleteExpense() {
    if (!editedExpense) return
    await deleteExpenseAction(editedExpense.id)
    setExpenses((current) => current.filter((entry) => entry.id !== editedExpense.id))
    closeExpense()
  }

  return (
    <div className={dark ? 'dark min-h-screen' : 'min-h-screen'}>
      <div className="min-h-screen bg-background text-foreground transition-colors">
        <div className="mx-auto flex min-h-screen max-w-[1440px]">
          <AppSidebar tab={tab} onTabChange={setTab} />

          <main className="min-w-0 flex-1 overflow-x-clip pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-10">
            <AppHeader
              title={title}
              mobileTitle={tab === 'Domů' ? 'Rodinný nákup' : tab}
              date={dateLabel}
              dark={dark}
              onToggleDark={toggleDark}
              notificationsOpen={notificationsOpen}
              onToggleNotifications={() => setNotificationsOpen((open) => !open)}
              unreadCount={unreadCount}
              onSelectTab={setTab}
              userName={userName}
            />
            {notificationsOpen && (
              <NotificationPanel
                notifications={notifications}
                onRead={readNotification}
                onReadAll={readAllNotifications}
                onClose={() => setNotificationsOpen(false)}
                pushPublicKey={pushPublicKey}
              />
            )}

            <div className="px-4 pt-4 sm:px-8 lg:px-12 lg:pt-0">
              {tab === 'Domů' && (
                <div className="mb-4 lg:hidden">
                  <p className="text-sm text-muted-foreground first-letter:uppercase">{dateLabel}</p>
                  <p className="mt-0.5 text-2xl font-semibold tracking-tight">{title}</p>
                </div>
              )}

              {tab === 'Domů' && (
                <div className="space-y-4 lg:space-y-6">
                  <TodayAttention
                    items={attentionItems({ today, receipts: pendingReceiptImports, productPrices: nearbyProductPrices, listNames: pendingNames })}
                    onOpen={setTab}
                  />
                  <DashboardOverview
                    today={today}
                    budget={budget}
                    spent={spent}
                    remaining={remaining}
                    completed={completed}
                    totalItems={items.length}
                    pendingNames={pendingNames}
                    onShopping={() => setTab('Nákup')}
                    onExpense={() => openExpense(null)}
                    onReceipt={() => setTab('Rozpočet')}
                    onStores={() => setTab('Obchody')}
                    onSetBudget={() => setTab('Profil')}
                  />
                  <QuickOutOfStock pantryItems={pantryItems} likelyGoneIds={likelyGonePantryIds} onGone={quickOut} />
                  <PriceWatch today={today} onStores={() => setTab('Obchody')} onAddToList={addItemByName} listItemNames={pendingNames} productPrices={nearbyProductPrices} offers={nearbyStandaloneOffers} pantryItems={pantryItems} chainFilter={dealsChain} onClearChainFilter={() => setDealsChain(null)} />
                  <MealPlan household={household} initialPlan={initialData.mealPlan} pantryItems={pantryItems} onAddIngredients={addIngredients} onMarkCooked={markMealCooked} />
                  <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
                    <SpendingBreakdown expenses={monthExpenses} onDetails={() => setTab('Rozpočet')} />
                    <SavingsInsight remaining={remaining} today={today} />
                  </div>
                </div>
              )}
              {tab === 'Nákup' && (
                <div className="mx-auto max-w-3xl space-y-5">
                  <OfflineBanner online={online} pending={pendingCount} dropped={droppedCount} onDismissDropped={() => setDroppedCount(0)} />
                  {pantryPrompt && (
                    <PantryPrompt
                      prompt={pantryPrompt}
                      onGone={() => {
                        removePantryItem(pantryPrompt.pantryItemId)
                        setPantryPrompt(null)
                      }}
                      onDismiss={() => setPantryPrompt(null)}
                    />
                  )}
                  <UsualItems suggestions={usualItems} onAdd={addUsualItems} />
                  <ShoppingList
                    today={today}
                    items={items}
                    newItem={newItem}
                    setNewItem={setNewItem}
                    addItem={addItem}
                    updateItem={updateItem}
                    removeItem={removeItem}
                    toggle={toggleItem}
                    lists={shoppingLists}
                    onAddList={addShoppingListName}
                    productPrices={nearbyProductPrices}
                    pins={pins}
                    onPin={pinProduct}
                    onUnpin={unpinProduct}
                    storeChains={storeChains}
                    storeSelection={storeSelection}
                    buildPlan={buildShoppingPlanAction}
                    remaining={remaining}
                    stores={stores}
                    userCoords={userLocation.coords}
                    completePurchase={completePurchase}
                  />
                </div>
              )}
              {tab === 'Zásoby' && (
                <div className="mx-auto max-w-3xl">
                  <Pantry items={pantryItems} onConfirm={confirmPantryItem} onRemove={removePantryItem} onMove={movePantryItem} onAdjustQuantity={adjustPantryItemQuantity} onReview={reviewPantry} onSetTracking={setPantryTracking} estimates={pantryEstimates} openCheck={pantryCheckPending} onCheckOpened={consumePantryCheck} />
                </div>
              )}
              {tab === 'Obchody' && (
                <StoreDirectory
                  onShowDeals={(chain) => {
                    setDealsChain(chain)
                    setTab('Domů')
                  }}
                  locationState={userLocation.state}
                  userCoords={userLocation.coords}
                  onRequestLocation={userLocation.requestLocation}
                  onClearLocation={userLocation.clearLocation}
                />
              )}
              {tab === 'Rozpočet' && (
                <div className="space-y-5 lg:space-y-6">
                  {/* Imports waiting on the household come first: they need an answer, everything else is browsing. */}
                  {listSuggestions && (
                    <ReceiptListSuggestions
                      key={listSuggestions.purchaseId}
                      suggestions={listSuggestions.items}
                      onConfirm={confirmListSuggestions}
                      onDismiss={() => setListSuggestions(null)}
                    />
                  )}
                  <ReceiptPending
                    items={pendingReceiptImports}
                    onRetry={retryReceiptImport}
                    onConfirmReview={confirmReceiptReview}
                    onResolveDuplicate={resolveDuplicateReceipt}
                    onCancel={cancelReceiptImport}
                  />
                  <BudgetOverview
                    today={today}
                    budget={budget}
                    onEditBudget={() => setTab('Profil')}
                    spent={spent}
                    expenses={expenses}
                    items={items}
                    onExpense={() => openExpense(null)}
                    primaryAction={<ReceiptImport stores={stores} onImport={importReceipt} onUpload={uploadReceipt} />}
                  />
                  <RecurringPayments
                    payments={recurringPayments}
                    occurrences={recurringOccurrences}
                    today={today}
                    onAdd={() => setRecurringEdit('new')}
                    onEdit={setRecurringEdit}
                    onConfirm={confirmRecurring}
                    onSkip={skipRecurring}
                  />
                  <ExpenseLedger expenses={expenses} today={today} limits={categoryBudgets} onAdd={() => openExpense(null)} onEdit={openExpense} onLimits={() => setLimitsOpen(true)} />
                  <PurchaseHistory records={initialData.purchaseHistory} />
                </div>
              )}
              {tab === 'AI' && <AiAssistant onShopping={() => setTab('Nákup')} />}
              {tab === 'Profil' && (
                <HouseholdProfile
                  household={household}
                  isOwner={initialData.isOwner}
                  pendingInvitations={pendingInvitations}
                  onUpdateHousehold={updateHousehold}
                  onAddMember={addMember}
                  onRemoveMember={removeMember}
                  onAddChild={addChild}
                  onRemoveChild={removeChild}
                  onUpdatePreferences={updatePreferences}
                  onInvite={inviteMember}
                  onRevokeInvitation={revokeInvitation}
                  storeChains={storeChains}
                  stores={stores}
                  storeSelection={storeSelection}
                  onSaveStorePreferences={saveStorePreferences}
                />
              )}
            </div>
          </main>
        </div>

        <MobileNav tab={tab} onTabChange={setTab} />

        {recurringEdit && (
          <RecurringPaymentModal
            key={recurringEdit === 'new' ? 'new' : recurringEdit.id}
            today={today}
            payment={recurringEdit === 'new' ? undefined : recurringEdit}
            onClose={() => setRecurringEdit(null)}
            onSave={saveRecurring}
            onStop={recurringEdit === 'new' ? undefined : stopRecurring}
          />
        )}
        {limitsOpen && <CategoryLimitsModal limits={categoryBudgets} onClose={() => setLimitsOpen(false)} onSave={saveLimits} />}
        {expenseOpen && (
          <ExpenseModal
            // A new key per opened expense, so the form starts from that expense's values.
            key={editedExpense?.id ?? 'new'}
            today={today}
            expense={editedExpense ?? undefined}
            onClose={closeExpense}
            onSave={saveExpense}
            onDelete={editedExpense ? deleteExpense : undefined}
          />
        )}
      </div>
    </div>
  )
}
