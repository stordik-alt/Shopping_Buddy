'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { addExpenseAction } from '@/app/actions/budget'
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
import { adjustPantryItemQuantityAction, confirmPantryItemAction, movePantryItemAction, removePantryItemAction } from '@/app/actions/pantry'
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
import { ExpenseHistory } from '@/components/budget/expense-history'
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
import { HouseholdProfile } from '@/components/household/household-profile'
import { NotificationPanel } from '@/components/notifications/notification-panel'
import { AppHeader } from '@/components/shared/app-header'
import { AppSidebar } from '@/components/shared/app-sidebar'
import { MobileNav } from '@/components/shared/mobile-nav'
import { Pantry } from '@/components/shopping/pantry'
import { ShoppingList } from '@/components/shopping/shopping-list'
import { StoreDirectory } from '@/components/stores/store-directory'
import { expensesInMonth, totalSpent } from '@/lib/budget'
import { longDate } from '@/lib/format'
import type { HouseholdData, ReceiptImportState } from '@/lib/db/queries'
import type { ReceiptListSuggestion } from '@/lib/db/receipt-list'
import type { Ingredient, MealType } from '@/lib/meal-plans'
import type { ProductPrice } from '@/lib/prices'
import { pollReceiptStatus } from '@/lib/receipt-progress'
import type { ReceiptLineItem } from '@/lib/receipts'
import type { Item, PantryLocation, Store, Tab } from '@/lib/types'
import type { PinRecord } from '@/lib/db/shopping-plan'
import { filterPricesToNearby, type StoreSelection } from '@/lib/nearby-stores'
import { nearbyOffers, type StandaloneOffer } from '@/lib/offers'
import { useUserLocation } from '@/lib/use-user-location'

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
}) {
  const [tab, setTab] = useState<Tab>('Domů')
  // The user's own "stores in my area". Until every branch has GPS, this selection decides which
  // stores' prices are compared and planned with (lib/nearby-stores.ts); nothing chosen = all stores.
  const [storeSelection, setStoreSelection] = useState(initialStoreSelection)
  // The products the user pinned to list items, per chain (the shopping planner buys exactly those).
  const [pins, setPins] = useState(initialPins)
  const nearbyProductPrices = useMemo(() => filterPricesToNearby(productPrices, storeSelection), [productPrices, storeSelection])
  const nearbyStandaloneOffers = useMemo(() => nearbyOffers(standaloneOffers, storeSelection), [standaloneOffers, storeSelection])
  const [household, setHousehold] = useState(initialData.household)
  const [items, setItems] = useState(initialData.items)
  const [dark, setDark] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialData.notifications)
  const [expenses, setExpenses] = useState(initialData.expenses)
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
    setItems(initialData.items)
    setNotifications(initialData.notifications)
    setExpenses(initialData.expenses)
    setShoppingLists(initialData.shoppingLists)
    setPendingInvitations(initialData.pendingInvitations)
    setPantryItems(initialData.pantryItems)
    setPendingReceiptImports(initialData.pendingReceiptImports)
  }, [initialData])

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 20_000)
    const onFocus = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onFocus)
    }
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

  async function addItem() {
    const name = newItem.trim()
    if (!name) return
    setNewItem('')
    const { item, notification } = await addShoppingItemAction(initialData.mainListId, name)
    setItems((current) => [...current, item])
    if (notification) setNotifications((current) => [...current, notification])
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

  function updateItem(id: string, changes: Partial<Item>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)))
    updateShoppingItemAction(id, changes)
  }

  function toggleItem(id: string) {
    const next = !items.find((item) => item.id === id)?.done
    setItems((current) => current.map((item) => (item.id === id ? { ...item, done: next } : item)))
    toggleShoppingItemAction(id, next)
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id))
    removeShoppingItemAction(id)
  }

  async function completePurchase() {
    const doneIds = new Set(items.filter((item) => item.done).map((item) => item.id))
    if (doneIds.size === 0) return
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
    const uploaded = await uploadReceiptAction(formData)
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

  async function saveExpense(amount: number, note: string, category: Item['category']) {
    const { expense, notification } = await addExpenseAction({ amount, note, category, date: today })
    setExpenses((current) => [...current, expense])
    if (notification) setNotifications((current) => [...current, notification])
    setExpenseOpen(false)
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
              onToggleDark={() => setDark(!dark)}
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
                  <DashboardOverview
                    budget={budget}
                    spent={spent}
                    remaining={remaining}
                    completed={completed}
                    totalItems={items.length}
                    pendingNames={pendingNames}
                    onShopping={() => setTab('Nákup')}
                    onExpense={() => setExpenseOpen(true)}
                    onReceipt={() => setTab('Rozpočet')}
                    onStores={() => setTab('Obchody')}
                    onSetBudget={() => setTab('Profil')}
                  />
                  <PriceWatch today={today} onStores={() => setTab('Obchody')} productPrices={nearbyProductPrices} offers={nearbyStandaloneOffers} pantryItems={pantryItems} />
                  <MealPlan household={household} initialPlan={initialData.mealPlan} pantryItems={pantryItems} onAddIngredients={addIngredients} onMarkCooked={markMealCooked} />
                  <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
                    <SpendingBreakdown expenses={monthExpenses} onDetails={() => setTab('Rozpočet')} />
                    <SavingsInsight remaining={remaining} onAi={() => setTab('AI')} />
                  </div>
                </div>
              )}
              {tab === 'Nákup' && (
                <div className="mx-auto max-w-3xl space-y-5">
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
                  <Pantry items={pantryItems} onConfirm={confirmPantryItem} onRemove={removePantryItem} onMove={movePantryItem} onAdjustQuantity={adjustPantryItemQuantity} />
                </div>
              )}
              {tab === 'Obchody' && (
                <StoreDirectory
                  stores={stores}
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
                    onExpense={() => setExpenseOpen(true)}
                  />
                  <ReceiptImport stores={stores} onImport={importReceipt} onUpload={uploadReceipt} />
                  <ExpenseHistory expenses={expenses} />
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

        {expenseOpen && <ExpenseModal today={today} onClose={() => setExpenseOpen(false)} onSave={saveExpense} />}
      </div>
    </div>
  )
}
