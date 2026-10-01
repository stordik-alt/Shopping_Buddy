'use client'

import { useMemo, useEffect, useState } from 'react'
import { buildShoppingPlanAction, pinProductAction, unpinProductAction } from '@/app/actions/shopping-plan'
import { createManualPurchaseAction } from '@/app/actions/purchases'
import { saveMyStorePreferencesAction } from '@/app/actions/store-preferences'
import { markMealCookedAction } from '@/app/actions/meal-plan'
import { markAllNotificationsReadAction, markNotificationReadAction } from '@/app/actions/notifications'
import type { ExpenseSplitPart } from '@/lib/purchase-expenses'
import { completePurchaseAction, getPurchaseExpenseItemsAction, recordPurchaseAsExpenseAction, setPurchaseItemExpenseSplitsAction } from '@/app/actions/purchases'
import { addShoppingItemAction, addShoppingListAction } from '@/app/actions/shopping'
import { AppHeader } from '@/components/shared/app-header'
import { AppSidebar } from '@/components/shared/app-sidebar'
import { MobileNav } from '@/components/shared/mobile-nav'
import { OfflineBanner } from '@/components/shopping/offline-banner'
import {
  AiAssistant,
  BudgetOverview,
  CategoryLimitsModal,
  CategorySnapshot,
  DashboardOverview,
  DealsTab,
  ExpenseLedger,
  ExpenseModal,
  HouseholdProfile,
  MealPlan,
  NotificationPanel,
  Pantry,
  PantryPrompt,
  PriceWatch,
  Recipes,
  PurchaseHistory,
  QuickOutOfStock,
  ReceiptImport,
  ReceiptListSuggestions,
  ReceiptPending,
  RecurringPaymentModal,
  RecurringPayments,
  SavingsInsight,
  ShoppingList,
  SpendingBreakdown,
  StoreDirectory,
  TodayAttention,
  UsualItems,
} from '@/components/shell/lazy-views'
import { useBudget } from '@/components/shell/use-budget'
import { useHousehold } from '@/components/shell/use-household'
import { usePantry } from '@/components/shell/use-pantry'
import { useReceipts } from '@/components/shell/use-receipts'
import { useServiceWorker, useTabNavigation, useTheme } from '@/components/shell/use-shell-environment'
import { useShoppingQueue } from '@/components/shell/use-shopping-queue'
import { applyPendingOps, newTempId } from '@/lib/offline-queue'
import { expensesInPeriod, totalSpent } from '@/lib/budget'
import { longDate, thisPeriodTitle } from '@/lib/format'
import type { HouseholdData, PurchaseAftermath, TickedListItem } from '@/lib/db/queries'
import { currentWeekStart, markMealCooked as markCooked, type Ingredient, type MealType } from '@/lib/meal-plans'
import type { ProductPrice } from '@/lib/prices'
import type { Item, Store, Tab } from '@/lib/types'
import type { PinRecord } from '@/lib/db/shopping-plan'
import { filterPricesToNearby, type StoreSelection } from '@/lib/nearby-stores'
import { nearbyOffers, type StandaloneOffer } from '@/lib/offers'
import { useUserLocation } from '@/lib/use-user-location'
import { attentionItems } from '@/lib/attention'
import { suggestUsualItems, type UsualItem } from '@/lib/usual-items'
import type { RecipeShoppingItem } from '@/lib/recipes/shopping'

// The shell owns what several sections share (the shopping list, notifications, purchase history)
// and wires the per-domain hooks in components/shell/ together; each hook keeps its own state,
// server actions and resync from a fresh server copy.
export function AppShell({
  initialData,
  userName,
  isAdmin,
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
  /** The account administers the app (offers the ideas management screen in the account menu). */
  isAdmin: boolean
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
  const { tab, setTab } = useTabNavigation(initialTab)

  const { dark, toggleDark } = useTheme()
  useServiceWorker()
  // Chain whose promotions the home screen lists after "Zobrazit akce" in the store directory.
  const [dealsChain, setDealsChain] = useState<string | null>(null)
  // The user's own "stores in my area". Until every branch has GPS, this selection decides which
  // stores' prices are compared and planned with (lib/nearby-stores.ts); nothing chosen = all stores.
  const [storeSelection, setStoreSelection] = useState(initialStoreSelection)
  // The products the user pinned to list items, per chain (the shopping planner buys exactly those).
  const [pins, setPins] = useState(initialPins)
  const nearbyProductPrices = useMemo(() => filterPricesToNearby(productPrices, storeSelection), [productPrices, storeSelection])
  const nearbyStandaloneOffers = useMemo(() => nearbyOffers(standaloneOffers, storeSelection), [standaloneOffers, storeSelection])
  const [items, setItems] = useState(initialData.items)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialData.notifications)
  // Kept in state so a category reassignment or a recorded purchase shows on the history screen
  // without re-rendering the whole page from the server.
  const [purchaseHistory, setPurchaseHistory] = useState(initialData.purchaseHistory)
  // The saved menu, kept here so it is still shown after switching tabs (saving it no longer re-renders the page).
  const [mealPlan, setMealPlan] = useState(initialData.mealPlan)
  const [newItem, setNewItem] = useState('')
  const [shoppingLists, setShoppingLists] = useState(initialData.shoppingLists)
  // Which of the three things the Nákup tab can show right now — the list itself is what people open
  // it for, so it stays the default even when a receipt is waiting on review.
  const [nakupView, setNakupView] = useState<'seznam' | 'nakupy' | 'uctenky'>('seznam')
  // Which of Rozpočet's two things is shown — the glanceable current state, or the browsable/editable
  // ledger (which already covers "historie" via its own month picker, so it is not a third view).
  const [rozpocetView, setRozpocetView] = useState<'stav' | 'vydaje'>('stav')
  const userLocation = useUserLocation()

  const { queueRef, pendingCount, online, droppedCount, dismissDropped, runOrQueue, flushQueue } = useShoppingQueue({
    householdId: initialData.household.id,
    mainListId: initialData.mainListId,
    setItems,
    setNotifications,
  })
  const { household, pendingInvitations, updateHousehold, addMember, removeMember, addChild, removeChild, updatePreferences, inviteMember, revokeInvitation } = useHousehold(initialData)
  const {
    expenses,
    setExpenses,
    expenseOpen,
    editedExpense,
    categoryBudgets,
    limitsOpen,
    setLimitsOpen,
    recurringPayments,
    recurringOccurrences,
    recurringEdit,
    setRecurringEdit,
    openExpense,
    closeExpense,
    saveExpense,
    deleteExpense,
    saveLimits,
    saveRecurring,
    stopRecurring,
    confirmRecurring,
    skipRecurring,
  } = useBudget({ initialData, setNotifications })

  const pantry = usePantry({ initialData, initialPantryCheck, items, purchaseHistory, today, setItems, setNotifications, runOrQueue })
  const {
    pantryItems,
    pantryPlaces,
    addPantryItem,
    pantryCheckinDays,
    pantryCheckinSubcategoryDays,
    pantryCheckPending,
    pantryPrompt,
    setPantryPrompt,
    pantryEstimates,
    likelyGonePantryIds,
    confirmPantryItem,
    removePantryItem,
    movePantryItem,
    addPantryPlace,
    removePantryPlace,
    setPantryCheckinDaysFor,
    setPantrySubcategoryCheckinDaysFor,
    reviewPantry,
    quickOut,
    consumePantryCheck,
    setPantryTracking,
    setPantryItemSubcategory,
    setPantryItemCategory,
    autoCategorizePantry,
    adjustPantryItemQuantity,
  } = pantry
  const {
    pendingReceiptImports,
    listSuggestions,
    dismissListSuggestions,
    confirmListSuggestions,
    importReceipt,
    uploadReceipt,
    retryReceiptImport,
    confirmReceiptReview,
    resolveDuplicateReceipt,
    cancelReceiptImport,
  } = useReceipts({ initialPending: initialData.pendingReceiptImports, applyPurchaseAftermath, applyTickedListItems })

  // initialData comes from a Server Component fetch. Resync local state whenever a fresh one arrives
  // (after a user-triggered router.refresh() or a reload). The app never triggers that re-render on
  // its own — an automatic refresh threw people back to the top of the page mid-task — so another
  // member's changes show up on the next reload or after the user's own next action. The hooks
  // resync their own state the same way.
  useEffect(() => {
    // Changes still waiting for a connection stay visible on top of the server's copy.
    setItems(applyPendingOps(initialData.items, queueRef.current))
    setNotifications(initialData.notifications)
    setPurchaseHistory(initialData.purchaseHistory)
    setMealPlan(initialData.mealPlan)
    setShoppingLists(initialData.shoppingLists)
  }, [initialData, queueRef])

  const budget = household.monthlyBudget
  // Only the expenses of the household's current budget period count against it (the calendar month
  // unless the household starts its period on another day).
  const periodStartDay = household.budgetPeriodStartDay
  const periodExpenses = useMemo(() => expensesInPeriod(expenses, today, periodStartDay), [expenses, today, periodStartDay])
  const spent = totalSpent(periodExpenses)
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
        purchases: purchaseHistory,
        today,
        onList: items.filter((item) => !item.done).map((item) => item.name),
        inPantry: pantryItems.map((item) => item.name),
      }),
    [purchaseHistory, today, items, pantryItems],
  )

  // Reassigns (or splits) one purchase item's expense. The server returns the recomputed expenses, so
  // the category and period totals update without re-rendering the whole page.
  async function saveItemSplits(purchaseItemId: string, splits: ExpenseSplitPart[]) {
    const result = await setPurchaseItemExpenseSplitsAction(purchaseItemId, splits)
    setExpenses(result.expenses)
    setPurchaseHistory((current) =>
      current.map((record) => (record.items.some((item) => item.id === purchaseItemId) ? { ...record, items: record.items.map((item) => (item.id === purchaseItemId ? { ...item, expenseSplits: splits } : item)) } : record)),
    )
  }

  async function addItem() {
    const name = newItem.trim()
    if (!name) return
    setNewItem('')
    await addItemByName(name)
  }

  // Shared by the "Co koupit?" field and the deals card's "Na seznam" button.
  async function addItemByName(name: string) {
    pantry.offerPantryCorrection(name)
    await runOrQueue({ kind: 'add', tempId: newTempId(), name })
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
        detail: `${ingredient.sourceMeasure ?? `${ingredient.quantity} ${ingredient.unit}`} · z jídelníčku`,
        category: ingredient.category,
        unit: ingredient.unit,
      })
      setItems((current) => [...current, item])
      if (notification) setNotifications((current) => [...current, notification])
    }
  }

  // Recipe ingredients reuse the same server-side shopping-item creation as manual additions, so
  // catalog matching, categorization, deal alerts and household authorization stay in one place.
  // The recipe flow has already removed any quantity covered by the pantry before it gets here.
  async function addRecipeIngredients(ingredients: RecipeShoppingItem[]): Promise<number> {
    let added = 0
    for (const ingredient of ingredients) {
      pantry.offerPantryCorrection(ingredient.name)
      const { item, notification } = await addShoppingItemAction(initialData.mainListId, ingredient.name, {
        detail: `${ingredient.sourceMeasure ?? `${ingredient.quantity} ${ingredient.unit}`} · z receptu`,
        unit: ingredient.unit,
      })
      setItems((current) => [...current, item])
      if (notification) setNotifications((current) => [...current, notification])
      added += 1
    }
    return added
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

  // What a purchase-creating action changed, in the shape the page holds it — replaces a full
  // page refresh (see getPurchaseAftermath).
  function applyPurchaseAftermath(aftermath: PurchaseAftermath) {
    setPurchaseHistory(aftermath.purchaseHistory)
    pantry.setPantryItems(aftermath.pantryItems)
    setExpenses(aftermath.expenses)
    setNotifications(aftermath.notifications)
    applyTickedListItems(aftermath.tickedListItems)
  }

  // Merged onto the list the page holds, so the items keep their colour and store.
  function applyTickedListItems(ticked: TickedListItem[]) {
    if (ticked.length === 0) return
    const tickedById = new Map(ticked.map((item) => [item.id, item]))
    setItems((current) => current.map((item) => (tickedById.has(item.id) ? { ...item, ...tickedById.get(item.id) } : item)))
  }

  async function completePurchase() {
    const doneIds = new Set(items.filter((item) => item.done).map((item) => item.id))
    if (doneIds.size === 0) return
    // The server completes what it knows is ticked, so waiting ticks go first; without a connection
    // the purchase waits (nothing is lost — the ticks stay queued).
    if (!navigator.onLine) return
    await flushQueue()
    if (queueRef.current.length > 0) return
    const { aftermath } = await completePurchaseAction(initialData.mainListId)
    // No aftermath means the server found nothing ticked; otherwise it removed every ticked item
    // (also ones an imported receipt had already recorded, which create no purchase here).
    if (!aftermath) return
    setItems((current) => current.filter((item) => !doneIds.has(item.id)))
    applyPurchaseAftermath(aftermath)
  }

  function addShoppingListName(name: string) {
    setShoppingLists((current) => [...current, name])
    addShoppingListAction(name)
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

  async function markMealCooked(day: string, mealType: MealType) {
    const { pantryItems: fresh } = await markMealCookedAction(day, mealType)
    pantry.setPantryItems(fresh) // the server deducted the meal's ingredients from the pantry
    setMealPlan((current) => (current ? { ...current, plan: markCooked(current.plan, day, mealType) } : current))
  }

  function readNotification(id: string) {
    setNotifications((current) => current.map((notification) => (notification.id === id ? { ...notification, unread: false } : notification)))
    markNotificationReadAction(id)
  }

  function readAllNotifications() {
    setNotifications((current) => current.map((notification) => ({ ...notification, unread: false })))
    markAllNotificationsReadAction()
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
              isAdmin={isAdmin}
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
                    onOpen={(item) => {
                      setTab(item.tab)
                      if (item.nakupView) setNakupView(item.nakupView)
                    }}
                  />
                  <DashboardOverview
                    today={today}
                    periodStartDay={periodStartDay}
                    budget={budget}
                    spent={spent}
                    remaining={remaining}
                    completed={completed}
                    totalItems={items.length}
                    pendingNames={pendingNames}
                    onShopping={() => setTab('Nákup')}
                    onExpense={() => openExpense(null)}
                    onReceipt={() => {
                      setTab('Nákup')
                      setNakupView('uctenky')
                    }}
                    onStores={() => setTab('Obchody')}
                    onSetBudget={() => setTab('Profil')}
                  />
                  <QuickOutOfStock pantryItems={pantryItems} likelyGoneIds={likelyGonePantryIds} onGone={quickOut} />
                  <PriceWatch today={today} onBrowseDeals={() => setTab('Akce')} onStores={() => setTab('Obchody')} onAddToList={addItemByName} listItemNames={pendingNames} productPrices={nearbyProductPrices} offers={nearbyStandaloneOffers} pantryItems={pantryItems} />
                  <MealPlan household={household} initialPlan={mealPlan} pantryItems={pantryItems} onAddIngredients={addIngredients} onMarkCooked={markMealCooked} onPlanSaved={(budgetLimit, plan) => setMealPlan({ weekStart: currentWeekStart(today), budgetLimit, plan })} />
                  <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
                    <SpendingBreakdown expenses={periodExpenses} periodTitle={thisPeriodTitle(today, periodStartDay)} onDetails={() => setTab('Rozpočet')} />
                    <SavingsInsight remaining={remaining} today={today} periodStartDay={periodStartDay} />
                  </div>
                </div>
              )}
              {tab === 'Nákup' && (
                <div className="mx-auto max-w-3xl space-y-5">
                  <OfflineBanner online={online} pending={pendingCount} dropped={droppedCount} onDismissDropped={() => dismissDropped()} />
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Zobrazení nákupu">
                    {(
                      [
                        ['seznam', 'Nákupní seznam'],
                        ['nakupy', 'Moje nákupy'],
                        ['uctenky', 'Účtenky'],
                      ] as const
                    ).map(([value, label]) => {
                      const pendingCountForView = value === 'uctenky' ? pendingReceiptImports.length + (listSuggestions ? 1 : 0) : 0
                      return (
                        <button
                          key={value}
                          onClick={() => setNakupView(value)}
                          aria-pressed={nakupView === value}
                          className={`relative min-h-9 rounded-full px-3 text-sm font-medium transition ${nakupView === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-primary/10'}`}
                        >
                          {label}
                          {pendingCountForView > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
                              {pendingCountForView > 9 ? '9+' : pendingCountForView}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {nakupView === 'seznam' && (
                    <>
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
                    </>
                  )}
                  {nakupView === 'nakupy' && (
                    <PurchaseHistory
                      records={purchaseHistory}
                      today={today}
                      storeChains={storeChains}
                      onCreateManualPurchase={async (input) => {
                        const result = await createManualPurchaseAction(input)
                        setPurchaseHistory((current) => [...current, result.purchase])
                        setExpenses(result.expenses)
                        setNotifications(result.notifications)
                        return result
                      }}
                      onSaveSplits={saveItemSplits}
                      onUploadReceipt={() => setNakupView('uctenky')}
                      onRecordExpenses={async (purchaseId) => {
                        const result = await recordPurchaseAsExpenseAction(purchaseId)
                        setExpenses(result.expenses)
                        setNotifications(result.notifications)
                        setPurchaseHistory((current) => current.map((record) => (record.id === purchaseId ? { ...record, needsBudgetRecording: false } : record)))
                      }}
                    />
                  )}
                  {nakupView === 'uctenky' && (
                    <div className="space-y-5">
                      <ReceiptImport stores={stores} onImport={importReceipt} onUpload={uploadReceipt} />
                      {listSuggestions && (
                        <ReceiptListSuggestions
                          key={listSuggestions.purchaseId}
                          suggestions={listSuggestions.items}
                          onConfirm={confirmListSuggestions}
                          onDismiss={() => dismissListSuggestions()}
                        />
                      )}
                      <ReceiptPending
                        items={pendingReceiptImports}
                        onRetry={retryReceiptImport}
                        onConfirmReview={confirmReceiptReview}
                        onResolveDuplicate={resolveDuplicateReceipt}
                        onCancel={cancelReceiptImport}
                      />
                    </div>
                  )}
                </div>
              )}
              {tab === 'Zásoby' && (
                <div className="mx-auto max-w-3xl">
                  <Pantry
                    items={pantryItems}
                    customPlaces={pantryPlaces}
                    onAddPantryItem={addPantryItem}
                    onConfirm={confirmPantryItem}
                    onRemove={removePantryItem}
                    onMove={movePantryItem}
                    onAdjustQuantity={adjustPantryItemQuantity}
                    onReview={reviewPantry}
                    onSetTracking={setPantryTracking}
                    onSetSubcategory={setPantryItemSubcategory}
                    onSetCategory={setPantryItemCategory}
                    onAutoCategorize={autoCategorizePantry}
                    estimates={pantryEstimates}
                    openCheck={pantryCheckPending}
                    onCheckOpened={consumePantryCheck}
                    onShopping={() => {
                      setNakupView('seznam')
                      setTab('Nákup')
                    }}
                    onReceipts={() => {
                      setNakupView('uctenky')
                      setTab('Nákup')
                    }}
                  />
                </div>
              )}
              {tab === 'Akce' && (
                <DealsTab
                  chains={storeChains.map((store) => store.chain)}
                  listItemNames={pendingNames}
                  onAddToList={addItemByName}
                  pantryItems={pantryItems}
                  initialChain={dealsChain}
                  onClearChain={() => setDealsChain(null)}
                />
              )}
              {tab === 'Obchody' && (
                <StoreDirectory
                  onShowDeals={(chain) => {
                    setDealsChain(chain)
                    setTab('Akce')
                  }}
                  locationState={userLocation.state}
                  userCoords={userLocation.coords}
                  onRequestLocation={userLocation.requestLocation}
                  onClearLocation={userLocation.clearLocation}
                />
              )}
              {tab === 'Recepty' && <Recipes pantryItems={pantryItems} onAddIngredients={addRecipeIngredients} onGoToShopping={() => setTab('Nákup')} />}
              {tab === 'Rozpočet' && (
                <div className="space-y-5 lg:space-y-6">
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Zobrazení rozpočtu">
                    {(
                      [
                        ['stav', 'Aktuální stav'],
                        ['vydaje', 'Výdaje'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setRozpocetView(value)}
                        aria-pressed={rozpocetView === value}
                        className={`min-h-9 rounded-full px-3 text-sm font-medium transition ${rozpocetView === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-primary/10'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {rozpocetView === 'stav' && (
                    <>
                      <BudgetOverview
                        today={today}
                        periodStartDay={periodStartDay}
                        budget={budget}
                        onEditBudget={() => setTab('Profil')}
                        spent={spent}
                        expenses={expenses}
                        items={items}
                        onExpense={() => openExpense(null)}
                      />
                      <CategorySnapshot expenses={expenses} today={today} periodStartDay={periodStartDay} limits={categoryBudgets} />
                      <RecurringPayments
                        payments={recurringPayments}
                        occurrences={recurringOccurrences}
                        today={today}
                        onAdd={() => setRecurringEdit('new')}
                        onEdit={setRecurringEdit}
                        onConfirm={confirmRecurring}
                        onSkip={skipRecurring}
                      />
                    </>
                  )}
                  {rozpocetView === 'vydaje' && (
                    <ExpenseLedger
                      expenses={expenses}
                      today={today}
                      periodStartDay={periodStartDay}
                      limits={categoryBudgets}
                      onAdd={() => openExpense(null)}
                      onEdit={openExpense}
                      onLimits={() => setLimitsOpen(true)}
                      onLoadItems={(purchaseId, category, subcategory) => getPurchaseExpenseItemsAction(purchaseId, category, subcategory)}
                      onSaveSplits={saveItemSplits}
                    />
                  )}
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
                  pantryPlaces={pantryPlaces}
                  onAddPantryPlace={addPantryPlace}
                  onRemovePantryPlace={removePantryPlace}
                  pantryCheckinDays={pantryCheckinDays}
                  onSetPantryCheckinDays={setPantryCheckinDaysFor}
                  pantryCheckinSubcategoryDays={pantryCheckinSubcategoryDays}
                  onSetPantrySubcategoryCheckinDays={setPantrySubcategoryCheckinDaysFor}
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
