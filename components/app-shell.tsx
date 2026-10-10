'use client'

import { useCallback, useMemo, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FocusTarget } from '@/lib/focus-target'
import { buildShoppingPlanAction, pinProductAction, unpinProductAction } from '@/app/actions/shopping-plan'
import { createManualPurchaseAction, deletePurchaseAction } from '@/app/actions/purchases'
import { saveMyStorePreferencesAction } from '@/app/actions/store-preferences'
import { markMealCookedAction } from '@/app/actions/meal-plan'
import { markAllNotificationsReadAction, markNotificationReadAction, setNotificationPreferenceAction } from '@/app/actions/notifications'
import { wantsNotification } from '@/lib/notification-kinds'
import type { ExpenseSplitPart } from '@/lib/purchase-expenses'
import { getPeriodExpensesAction } from '@/app/actions/budget'
import { completePurchaseAction, getPurchaseExpenseItemsAction, recordPurchaseAsExpenseAction, setPurchaseItemExpenseSplitsAction } from '@/app/actions/purchases'
import { addShoppingItemAction, addShoppingListAction, resolveRecipePackageHintsAction } from '@/app/actions/shopping'
import { AppHeader } from '@/components/shared/app-header'
import { resolveRecipePackage } from '@/lib/recipes/packaging'
import { Recipes } from '@/components/recipes/recipes'
import { AppSidebar } from '@/components/shared/app-sidebar'
import { MobileNav } from '@/components/shared/mobile-nav'
import { OfflineBanner } from '@/components/shopping/offline-banner'
import { CollapsibleSection } from '@/components/shared/collapsible-section'
import { TodayMeals } from '@/components/dashboard/today-meals'
import { PantryCheckCard } from '@/components/dashboard/pantry-check-card'
import { keptNameKey, needsCheck } from '@/lib/pantry'
import { PieChart } from 'lucide-react'
import { SegmentedControl } from '@/components/ui/segmented-control'
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
  NotificationPanel,
  Pantry,
  PantryPrompt,
  PriceWatch,
  PurchaseHistory,
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
import type { ProductAutocompleteSelection } from '@/components/shared/product-autocomplete'
import { useBudget } from '@/components/shell/use-budget'
import { useBudgetPeriods } from '@/components/shell/use-budget-periods'
import { PreferredDeals } from '@/components/dashboard/preferred-deals'
import { BudgetPlanCard, BudgetPlanSheet } from '@/components/budget/budget-plan'
import { BudgetPlanning } from '@/components/budget/budget-planning'
import { useHousehold } from '@/components/shell/use-household'
import { useBudgetLedger } from '@/components/shell/use-budget-ledger'
import { useBudgetOutlook } from '@/components/shell/use-budget-outlook'
import { usePeriodHistory } from '@/components/shell/use-period-history'
import { usePlannedExpenses } from '@/components/shell/use-planned-expenses'
import { useIncomes } from '@/components/shell/use-incomes'
import { usePantry } from '@/components/shell/use-pantry'
import { useReceipts } from '@/components/shell/use-receipts'
import { useServiceWorker, useTabNavigation, useTheme } from '@/components/shell/use-shell-environment'
import { useShoppingQueue } from '@/components/shell/use-shopping-queue'
import { applyPendingOps, newTempId } from '@/lib/offline-queue'
import { budgetForPeriod, expensesInPeriod, nextPeriodStart, periodEnd, periodStart, spendingByPeriod, totalSpent } from '@/lib/budget'
import { pendingCommitments } from '@/lib/budget-forecast'
import { periodConfigKey, type PeriodConfig } from '@/lib/budget-period'
import { longDate, thisPeriodTitle } from '@/lib/format'
import type { HouseholdData, PurchaseAftermath, TickedListItem } from '@/lib/db/queries'
import { currentWeekStart, markMealCooked as markCooked, todaysMeals, type Ingredient, type MealType } from '@/lib/meal-plans'
import type { ProductPrice } from '@/lib/prices'
import { findOpenListItemByName, type ProductSearchHit } from '@/lib/product-search'
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
  initialDealsChain = null,
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
  /** Akce opened from a new flyer notification starts filtered to its chain. */
  initialDealsChain?: string | null
  /** The server's Web Push key; null when push notifications are not configured (lib/push/). */
  pushPublicKey: string | null
}) {
  const { tab, setTab } = useTabNavigation(initialTab)

  const { dark, toggleDark } = useTheme()
  useServiceWorker()
  // Chain whose promotions the home screen lists after "Zobrazit akce" in the store directory.
  const [dealsChain, setDealsChain] = useState<string | null>(initialDealsChain)
  // Akce opened from Domů's "Akce na vaše oblíbené" starts with "Pro mě" on.
  const [dealsForMe, setDealsForMe] = useState(false)
  useEffect(() => {
    // Leaving Akce forgets it; opened again from the menu it shows every deal.
    if (tab !== 'Akce') setDealsForMe(false)
  }, [tab])
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
  // The kinds this member switched off (Profil ▸ Upozornění); left out of their bell panel and count.
  const [notificationsOff, setNotificationsOff] = useState<string[]>(initialData.notificationsOff)
  const visibleNotifications = useMemo(() => {
    const off = new Set(notificationsOff)
    return notifications.filter((notification) => wantsNotification(notification.kind, off))
  }, [notifications, notificationsOff])
  // Kept in state so a category reassignment or a recorded purchase shows on the history screen
  // without re-rendering the whole page from the server.
  const router = useRouter()
  const [purchaseHistory, setPurchaseHistory] = useState(initialData.purchaseHistory)
  // What the household has ever bought, for the deals' "stock up" hint (lib/pantry.ts householdKeeps).
  const boughtNameKeys = useMemo(() => new Set(purchaseHistory.flatMap((purchase) => purchase.items.map((item) => keptNameKey(item.name)))), [purchaseHistory])
  // The saved menu, kept here so it is still shown after switching tabs (saving it no longer re-renders the page).
  const [mealPlan, setMealPlan] = useState(initialData.mealPlan)
  const [newItem, setNewItem] = useState('')
  const [shoppingLists, setShoppingLists] = useState(initialData.shoppingLists)
  // Which of the three things the Nákup tab can show right now — the list itself is what people open
  // it for, so it stays the default even when a receipt is waiting on review.
  const [nakupView, setNakupView] = useState<'seznam' | 'nakupy' | 'uctenky'>('seznam')
  // What a tap on Domů should open inside its tab (lib/focus-target.ts); each screen consumes it once.
  const [focus, setFocus] = useState<FocusTarget | null>(null)
  const clearFocus = useCallback(() => setFocus(null), [])
  // Which part of Rozpočet is shown (docs/15_BUDGET_PERIODS.md §2): Přehled (the glanceable current
  // state), Výdaje (the browsable/editable ledger, which also covers history via its period picker) or
  // Plánování (income and, later, the plan of each period).
  const [rozpocetView, setRozpocetView] = useState<'stav' | 'vydaje' | 'planovani'>('stav')
  // A finished period chosen in Plán a úspory, opened in Výdaje.
  const [ledgerPeriod, setLedgerPeriod] = useState<string | undefined>(undefined)
  // Which period Plánování shows: 0 is the running one, n the n-th period ahead (docs/15 §14, §16).
  const [planningOffset, setPlanningOffset] = useState(0)
  const [planOpen, setPlanOpen] = useState(false)
  const userLocation = useUserLocation()

  const { queueRef, pendingCount, online, droppedCount, dismissDropped, runOrQueue, flushQueue } = useShoppingQueue({
    householdId: initialData.household.id,
    mainListId: initialData.mainListId,
    setItems,
    setNotifications,
  })
  const { household, pendingInvitations, updateHousehold, updateBudgetPeriod, addMember, removeMember, setMemberDiet, addChild, removeChild, updatePreferences, inviteMember, revokeInvitation } = useHousehold(initialData)
  const periods = useBudgetPeriods({ initialData, today, period: household.budgetPeriod, active: tab === 'Rozpočet' })
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
  } = useBudget({ initialData, setNotifications, onExpenseDatesChanged: periods.expenseDatesChanged })

  const pantry = usePantry({ initialData, initialPantryCheck, items, purchaseHistory, today, setItems, setNotifications })
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
    openPantryCheck,
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

  // Only the expenses of the household's current budget period count against it (the calendar month
  // unless the household starts its period on another day), and against that period's own budget when
  // the household set one (docs/15_BUDGET_PERIODS.md).
  const budgetPeriod = household.budgetPeriod
  const currentPeriodStart = periodStart(today, budgetPeriod)
  const budget = budgetForPeriod(currentPeriodStart, periods.periodBudgets, household.monthlyBudget)
  // The period Plánování shows: the running one, or one ahead that is only being planned.
  let planningStart = currentPeriodStart
  for (let ahead = 0; ahead < planningOffset; ahead++) planningStart = nextPeriodStart(planningStart, budgetPeriod)
  const planningActive = tab === 'Rozpočet' && rozpocetView === 'planovani'
  const incomes = useIncomes({ period: planningStart, until: nextPeriodStart(planningStart, budgetPeriod), active: planningActive })
  // Kapsy, the carry and the period to close belong to the running period; a period ahead has none yet.
  const pockets = useBudgetLedger({ period: planningStart, active: planningActive && planningOffset === 0 })
  const plannedExpenses = usePlannedExpenses({
    period: planningStart,
    until: nextPeriodStart(planningStart, budgetPeriod),
    active: tab === 'Rozpočet' && rozpocetView === 'planovani',
    // A paid plan is a real expense: Výdaje and the balance see it at once.
    onPaid: (expense, created) => {
      setExpenses((current) => [...current, expense].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)))
      if (created.length > 0) setNotifications((current) => [...current, ...created])
      periods.expenseDatesChanged([expense.date])
    },
  })
  // History is read again whenever a closing or the period setting changes what it shows.
  const periodHistory = usePeriodHistory({
    active: tab === 'Rozpočet' && rozpocetView === 'planovani',
    reloadKey: `${periodConfigKey(budgetPeriod)}|${currentPeriodStart}|${pockets.ledger?.toClose?.periodStart ?? ''}|${pockets.ledger?.previousClosedStart ?? ''}`,
  })
  /** Saves a new budget period, then loads the expenses of the new current period: the page only
   *  loaded them from the start of the old one, and the new one can begin earlier. */
  async function changeBudgetPeriod(period: PeriodConfig) {
    await updateBudgetPeriod(period)
    // Periods ahead are cut by the old setting; start again from the running one.
    setPlanningOffset(0)
    let rows: Awaited<ReturnType<typeof getPeriodExpensesAction>>
    try {
      rows = await getPeriodExpensesAction(periodStart(today, period))
    } catch {
      throw new Error('Období je uložené, ale výdaje za něj se nepodařilo načíst. Obnovte stránku.')
    }
    setExpenses((current) => {
      const byId = new Map(current.map((expense) => [expense.id, expense]))
      for (const row of rows) byId.set(row.id, row)
      return [...byId.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    })
  }
  // Výdaje shows past periods from their own copies; an expense on the page wins over a stale copy.
  const ledgerExpenses = useMemo(() => {
    const byId = new Map<string, (typeof expenses)[number]>()
    for (const expense of [...Object.values(periods.pastExpenses).flat(), ...expenses]) byId.set(expense.id, expense)
    return [...byId.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  }, [periods.pastExpenses, expenses])
  // A period opened from the history may have no expense yet, and the picker should still offer it.
  const historyPeriods = useMemo(() => {
    const known = periods.history ? [...spendingByPeriod(periods.history, budgetPeriod).keys()] : []
    return ledgerPeriod && !known.includes(ledgerPeriod) ? [...known, ledgerPeriod] : known
  }, [periods.history, budgetPeriod, ledgerPeriod])
  const periodExpenses = useMemo(() => expensesInPeriod(expenses, today, budgetPeriod), [expenses, today, budgetPeriod])
  const spent = totalSpent(periodExpenses)
  // The outlook is read again whenever something it is made of changes: the period setting, a budget,
  // an income, a planned expense, a Kapsa's planned contribution or what was spent.
  const budgetOutlook = useBudgetOutlook({
    active: planningActive,
    reloadKey: [
      periodConfigKey(budgetPeriod),
      currentPeriodStart,
      household.monthlyBudget,
      JSON.stringify(periods.periodBudgets),
      spent,
      (incomes.incomes ?? []).map((row) => `${row.id}:${row.amount}:${row.date}:${row.status}`).join(','),
      (plannedExpenses.plannedExpenses ?? []).map((row) => `${row.id}:${row.amount}:${row.date}:${row.status}`).join(','),
      (pockets.ledger?.pockets ?? []).map((pocket) => `${pocket.id}:${pocket.plannedContribution}:${pocket.balance}`).join(','),
    ].join('|'),
  })
  const remaining = budget - spent
  const completed = items.filter((item) => item.done).length

  const firstName = userName.trim().split(/\s+/)[0] || userName
  const title = tab === 'Domů' ? `Ahoj, ${firstName}` : tab
  const dateLabel = longDate(today)
  const unreadCount = visibleNotifications.filter((notification) => notification.unread).length
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

  async function addItem(selection?: ProductAutocompleteSelection) {
    const name = newItem.trim()
    if (!name) return
    setNewItem('')
    await addItemByName(name, selection)
  }

  // Shared by the "Co koupit?" field and the deals card's "Na seznam" button.
  async function addItemByName(name: string, selection?: ProductAutocompleteSelection) {
    pantry.offerPantryCorrection(name)
    const persistedSelection = selection?.kind === 'product' && selection.productId
      ? { kind: 'product' as const, productId: selection.productId }
      : selection?.kind === 'type' && selection.productTypeKey
        ? { kind: 'type' as const, productTypeKey: selection.productTypeKey }
        : undefined
    await runOrQueue({ kind: 'add', tempId: newTempId(), name, selection: persistedSelection })
  }

  // Sequential on purpose — was Promise.all, which fired one addShoppingItemAction per ingredient
  // concurrently. Each call ends in its own revalidatePath('/'), and with a dozen-plus in flight
  // at once (routine now that a stock-aware meal plan's "toBuy" list can run to 20-30 items), the
  // client can end up applying a stale mid-batch server snapshot over the correct optimistic
  // state, leaving the shopping list looking empty until a hard reload even though every insert
  // actually succeeded. Awaiting one at a time keeps at most one revalidation in flight.
  async function addIngredients(ingredients: Ingredient[]) {
    setTab('Nákup')
    const packageHints = await resolveRecipePackageHintsAction(ingredients.map((ingredient) => ingredient.name))
    for (const ingredient of ingredients) {
      const packageHint = ingredient.sourceMeasure ? null : resolveRecipePackage(ingredient.quantity, ingredient.unit, packageHints[ingredient.name] ?? [])
      const recipeDetail = ingredient.sourceMeasure ?? String(ingredient.quantity) + ' ' + ingredient.unit
      const detail = packageHint ? recipeDetail + ' · ' + packageHint.label + ' · z jídelníčku' : recipeDetail + ' · z jídelníčku'
      const { item, notification } = await addShoppingItemAction(initialData.mainListId, ingredient.name, {
        detail, category: ingredient.category, unit: ingredient.unit,
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
        quantity: ingredient.quantity,
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

  /** "Na seznam (vybrat v Lidl)" in the store product search: puts the found product on the main
   *  list and chooses it there for its chain, so the planner buys exactly that one (docs/01, shopping
   *  planner part 1/2). Adding and pinning go through the same server actions as the rest of the app
   *  (addShoppingItemAction resolves catalog identity, categorization and the deal notification;
   *  pinProductAction checks household ownership), never through a second write path. Reported back
   *  so the search button can say how far a hit already got. */
  async function addSearchHitToShoppingList(hit: ProductSearchHit): Promise<{ added: boolean; pinned: boolean }> {
    // The same product may already be on the list (which is not a pin — the item was typed). Reuse it
    // rather than adding a second row for one product.
    let item = findOpenListItemByName(items, hit.name)
    let added = item != null
    if (!item) {
      const created = await addShoppingItemAction(initialData.mainListId, hit.name, { category: hit.category, ...(hit.unit ? { unit: hit.unit } : {}) })
      item = created.item
      setItems((current) => [...current, created.item])
      if (created.notification) {
        const notification = created.notification
        setNotifications((current) => [...current, notification])
      }
      added = true
    }
    const alreadyPinned = pins.some((pin) => pin.itemId === item.id && pin.storeId === hit.storeId && pin.productId === hit.productId)
    // An item already on the list is not a second row; only the chain's choice is added to it.
    if (!alreadyPinned) await pinProduct(item.id, hit.storeId, hit.productId)
    return { added, pinned: true }
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
    // A notification disappears immediately after the tap. The server action persists the read state,
    // and the initial query also excludes read rows so historical notifications do not return after reload.
    setNotifications((current) => current.filter((notification) => notification.id !== id))
    void markNotificationReadAction(id)
  }

  function readAllNotifications() {
    setNotifications((current) => current.filter((notification) => !notification.unread))
    void markAllNotificationsReadAction()
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
                notifications={visibleNotifications}
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
                      setFocus(item.focus ?? null)
                      setNakupView(item.nakupView ?? 'seznam')
                      setTab(item.tab)
                    }}
                  />
                  <DashboardOverview
                    today={today}
                    period={budgetPeriod}
                    budget={budget}
                    spent={spent}
                    remaining={remaining}
                    completed={completed}
                    totalItems={items.length}
                    pendingNames={pendingNames}
                    onBudget={() => {
                      setTab('Rozpočet')
                      setRozpocetView('stav')
                    }}
                    onShopping={() => {
                      setTab('Nákup')
                      setNakupView('seznam')
                    }}
                    onExpense={() => openExpense(null)}
                    onReceipt={() => {
                      setTab('Nákup')
                      setNakupView('uctenky')
                    }}
                    onStores={() => setTab('Obchody')}
                    onSetBudget={() => setTab('Profil')}
                    afterBudget={
                      // Folded by default: the budget card above already gives the key numbers.
                                        <CollapsibleSection title="Výdaje podle kategorií" summary={`${thisPeriodTitle(today, budgetPeriod)} · utraceno ${spent.toLocaleString('cs-CZ')} Kč`} icon={<PieChart className="size-5" aria-hidden="true" />}>
                        <div className="space-y-6">
                          <SavingsInsight embedded remaining={remaining} today={today} period={budgetPeriod} />
                          <SpendingBreakdown
                            embedded
                            expenses={periodExpenses}
                            periodTitle={thisPeriodTitle(today, budgetPeriod)}
                            onDetails={() => {
                              setTab('Rozpočet')
                              setRozpocetView('stav')
                            }}
                          />
                        </div>
                      </CollapsibleSection>
                    }
                  />
                  <PantryCheckCard
                    toCheck={pantryItems.filter((item) => needsCheck(item, likelyGonePantryIds)).length}
                    onCheck={() => {
                      openPantryCheck()
                      setTab('Zásoby')
                    }}
                    onOpen={() => setTab('Zásoby')}
                  />
                  <TodayMeals
                    meals={todaysMeals(mealPlan, today)}
                    onOpen={() => {
                      setFocus(null)
                      setTab('Recepty')
                    }}
                    onOpenMeal={(day, mealType) => {
                      setFocus({ kind: 'meal', day, mealType })
                      setTab('Recepty')
                    }}
                  />
                  <PreferredDeals
                    hasPreferences={household.preferences.preferredProducts.length + household.preferences.preferredBrands.length > 0}
                    listItemNames={pendingNames}
                    onAddToList={addItemByName}
                    onShowAll={() => {
                      setDealsForMe(true)
                      setTab('Akce')
                    }}
                  />
                  <PriceWatch today={today} onBrowseDeals={() => {
                    setDealsForMe(false)
                    setTab('Akce')
                  }} onStores={() => setTab('Obchody')} onAddToList={addItemByName} listItemNames={pendingNames} productPrices={nearbyProductPrices} offers={nearbyStandaloneOffers} pantryItems={pantryItems} boughtNameKeys={boughtNameKeys} />
                </div>
              )}
              {tab === 'Nákup' && (
                <div className="mx-auto max-w-3xl space-y-5">
                  <OfflineBanner online={online} pending={pendingCount} dropped={droppedCount} onDismissDropped={() => dismissDropped()} />
                  <SegmentedControl
                    label="Zobrazení nákupu"
                    value={nakupView}
                    onChange={setNakupView}
                    options={[
                      { value: 'seznam', label: 'Nákupní seznam' },
                      { value: 'nakupy', label: 'Moje nákupy' },
                      { value: 'uctenky', label: 'Účtenky', badge: pendingReceiptImports.length + (listSuggestions ? 1 : 0) },
                    ]}
                  />
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
                        focusItemName={focus?.kind === 'list-item' ? focus.name : null}
                        onFocusHandled={clearFocus}
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
                        onAddSearchHit={addSearchHitToShoppingList}
                        offers={nearbyStandaloneOffers}
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
                      onDeletePurchase={async (purchaseId) => {
                        const { date } = await deletePurchaseAction(purchaseId)
                        setPurchaseHistory((current) => current.filter((purchase) => purchase.id !== purchaseId))
                        // Its expenses, pantry rows and unticked list items come back with the
                        // household's data; a past period's totals are loaded again when next shown.
                        periods.expenseDatesChanged([date])
                        router.refresh()
                      }}
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
                        focusId={focus?.kind === 'receipt' ? focus.id : null}
                        onFocusHandled={clearFocus}
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
                  key={dealsForMe ? 'pro-me' : 'vse'}
                  hasPreferences={household.preferences.preferredProducts.length + household.preferences.preferredBrands.length > 0}
                  initialForMe={dealsForMe}
                  chains={storeChains.map((store) => store.chain)}
                  listItemNames={pendingNames}
                  onAddToList={addItemByName}
                  pantryItems={pantryItems}
                  boughtNameKeys={boughtNameKeys}
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
              {tab === 'Recepty' && <Recipes focusMeal={focus?.kind === 'meal' ? { day: focus.day, mealType: focus.mealType } : null} onFocusHandled={clearFocus} household={household} initialPlan={mealPlan} pantryItems={pantryItems} onAddIngredients={addRecipeIngredients} onAddMealPlanIngredients={addIngredients} onMarkCooked={markMealCooked} onPlanSaved={(budgetLimit, plan) => setMealPlan({ weekStart: currentWeekStart(today), budgetLimit, plan })} onGoToShopping={() => setTab('Nákup')} />}
              {tab === 'Rozpočet' && (
                <div className="space-y-5 lg:space-y-6">
                  <SegmentedControl
                    label="Zobrazení rozpočtu"
                    value={rozpocetView}
                    onChange={(view) => {
                      // Výdaje opened by hand starts at the current period again.
                      setLedgerPeriod(undefined)
                      setPlanningOffset(0)
                      setRozpocetView(view)
                    }}
                    options={[
                      { value: 'stav', label: 'Přehled' },
                      { value: 'vydaje', label: 'Výdaje' },
                      { value: 'planovani', label: 'Plánování' },
                    ]}
                  />
                  {rozpocetView === 'stav' && (
                    <>
                      <BudgetOverview
                        today={today}
                        period={budgetPeriod}
                        budget={budget}
                        onEditBudget={() => setPlanOpen(true)}
                        spent={spent}
                        expenses={expenses}
                        items={items}
                        onExpense={() => openExpense(null)}
                      />
                      <BudgetPlanCard
                        today={today}
                        period={budgetPeriod}
                        defaultBudget={household.monthlyBudget}
                        periodBudgets={periods.periodBudgets}
                        savingsGoal={periods.savingsGoal}
                        spent={spent}
                        history={periods.history}
                        historyError={periods.historyError}
                        onRetryHistory={periods.retryHistory}
                        onEdit={() => setPlanOpen(true)}
                        onOpenPeriod={(period) => {
                          setLedgerPeriod(period)
                          setRozpocetView('vydaje')
                        }}
                      />
                      <CategorySnapshot expenses={expenses} today={today} period={budgetPeriod} limits={categoryBudgets} />
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
                      key={ledgerPeriod ?? 'current'}
                      expenses={ledgerExpenses}
                      extraPeriods={historyPeriods}
                      initialPeriod={ledgerPeriod}
                      onShowPeriod={periods.openPeriod}
                      loadingPeriod={periods.loadingPeriod}
                      periodError={periods.periodError}
                      onRetryPeriod={periods.retryPeriod}
                      today={today}
                      period={budgetPeriod}
                      limits={categoryBudgets}
                      onAdd={() => openExpense(null)}
                      onEdit={openExpense}
                      onLimits={() => setLimitsOpen(true)}
                      onLoadItems={(purchaseId, category, subcategory) => getPurchaseExpenseItemsAction(purchaseId, category, subcategory)}
                      onSaveSplits={saveItemSplits}
                    />
                  )}
                  {rozpocetView === 'planovani' && (
                    <BudgetPlanning
                      period={planningStart}
                      periodEnd={periodEnd(planningStart, budgetPeriod)}
                      today={today}
                      spent={spent}
                      incomes={incomes}
                      pockets={pockets}
                      history={periodHistory}
                      plannedExpenses={plannedExpenses}
                      commitments={pendingCommitments(recurringPayments, recurringOccurrences, planningStart, periodEnd(planningStart, budgetPeriod))}
                      commitmentsFor={(start) => pendingCommitments(recurringPayments, recurringOccurrences, start, periodEnd(start, budgetPeriod)).reduce((sum, item) => sum + item.amount, 0)}
                      outlook={budgetOutlook}
                      offset={planningOffset}
                      onOffsetChange={setPlanningOffset}
                      onOpenExpenses={(start) => {
                        setLedgerPeriod(start)
                        setRozpocetView('vydaje')
                      }}
                      budgetPeriod={budgetPeriod}
                      onChangePeriod={changeBudgetPeriod}
                    />
                  )}
                </div>
              )}
              {tab === 'AI' && <AiAssistant onShopping={() => setTab('Nákup')} />}
              {tab === 'Profil' && (
                <HouseholdProfile
                  notificationsOff={notificationsOff}
                  onSetNotificationKind={async (kind, enabled) => {
                    // Shown at once; put back if the server refuses.
                    const before = notificationsOff
                    setNotificationsOff((current) => (enabled ? current.filter((entry) => entry !== kind) : [...new Set([...current, kind])]))
                    try {
                      await setNotificationPreferenceAction(kind, enabled)
                    } catch (error) {
                      setNotificationsOff(before)
                      throw error
                    }
                  }}
                  pushPublicKey={pushPublicKey}
                  household={household}
                  isOwner={initialData.isOwner}
                  pendingInvitations={pendingInvitations}
                  onUpdateHousehold={updateHousehold}
                  onAddMember={addMember}
                  onRemoveMember={removeMember}
                  onSetMemberDiet={setMemberDiet}
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
        {planOpen && (
          <BudgetPlanSheet
            today={today}
            period={budgetPeriod}
            defaultBudget={household.monthlyBudget}
            periodBudgets={periods.periodBudgets}
            savingsGoal={periods.savingsGoal}
            onClose={() => setPlanOpen(false)}
            onSave={periods.savePlan}
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
