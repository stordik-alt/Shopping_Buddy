'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { addExpenseAction } from '@/app/actions/budget'
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
import { confirmPantryItemAction, movePantryItemAction, removePantryItemAction } from '@/app/actions/pantry'
import { completePurchaseAction } from '@/app/actions/purchases'
import {
  cancelReceiptImportAction,
  confirmReceiptReviewAction,
  importReceiptAction,
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
import { ReceiptPending } from '@/components/budget/receipt-pending'
import { DashboardOverview } from '@/components/dashboard/dashboard-overview'
import { MealPlan } from '@/components/dashboard/meal-plan'
import { PriceWatch } from '@/components/dashboard/price-watch'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { SavingsInsight } from '@/components/dashboard/savings-insight'
import { HouseholdProfile } from '@/components/household/household-profile'
import { NotificationPanel } from '@/components/notifications/notification-panel'
import { AppHeader } from '@/components/shared/app-header'
import { AppSidebar } from '@/components/shared/app-sidebar'
import { MobileNav } from '@/components/shared/mobile-nav'
import { Pantry } from '@/components/shopping/pantry'
import { ShoppingList } from '@/components/shopping/shopping-list'
import { StoreDirectory } from '@/components/stores/store-directory'
import { TODAY } from '@/lib/budget'
import type { HouseholdData, ReceiptImportState } from '@/lib/db/queries'
import type { MealType } from '@/lib/meal-plans'
import type { ProductPrice } from '@/lib/prices'
import type { ReceiptLineItem } from '@/lib/receipts'
import type { Item, PantryLocation, Store, Tab } from '@/lib/types'
import { useUserLocation } from '@/lib/use-user-location'

export function AppShell({
  initialData,
  userName,
  stores,
  productPrices,
}: {
  initialData: HouseholdData
  userName: string
  stores: Store[]
  productPrices: ProductPrice[]
}) {
  const [tab, setTab] = useState<Tab>('Domů')
  const [household, setHousehold] = useState(initialData.household)
  const [items, setItems] = useState(initialData.items)
  const [dark, setDark] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialData.notifications)
  const [expenses, setExpenses] = useState(initialData.expenses)
  const [newItem, setNewItem] = useState('')
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
  const spent = expenses.reduce((total, expense) => total + expense.amount, 0)
  const remaining = budget - spent
  const completed = items.filter((item) => item.done).length

  const firstName = userName.trim().split(/\s+/)[0] || userName
  const title = tab === 'Domů' ? `Dobré ráno, ${firstName}` : tab
  const subtitle = tab === 'Domů' ? 'Pojďme dnes ušetřit pár korun.' : 'Vše, co potřebujete mít pod kontrolou.'

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
  async function addIngredients(ingredients: { name: string; category: Item['category'] }[]) {
    setTab('Nákup')
    for (const ingredient of ingredients) {
      const { item, notification } = await addShoppingItemAction(initialData.mainListId, ingredient.name, {
        detail: '1 ks · z jídelníčku',
        category: ingredient.category,
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

  function markMealCooked(day: string, mealType: MealType) {
    markMealCookedAction(day, mealType)
    router.refresh() // picks up the pantry deduction the server action just made
  }

  async function importReceipt(items: ReceiptLineItem[], options: { date?: string; storeLocationId?: string }) {
    await importReceiptAction(items, options)
    router.refresh() // picks up the new purchase-history entry and restocked pantry
  }

  function upsertPendingReceipt(result: ReceiptImportState) {
    setPendingReceiptImports((current) => {
      const withoutThis = current.filter((r) => r.id !== result.id)
      const stillPending = result.status !== 'completed' && result.status !== 'cancelled'
      return stillPending ? [...withoutThis, result] : withoutThis
    })
  }

  async function uploadReceipt(base64: string, mimeType: string) {
    const result = await uploadReceiptAction(base64, mimeType)
    upsertPendingReceipt(result)
    router.refresh() // picks up a new purchase/pantry restock if it completed outright
    return result
  }

  async function retryReceiptImport(id: string) {
    const result = await retryReceiptImportAction(id)
    upsertPendingReceipt(result)
    router.refresh()
    return result
  }

  async function confirmReceiptReview(id: string, items: ReceiptLineItem[]) {
    await confirmReceiptReviewAction(id, items)
    setPendingReceiptImports((current) => current.filter((r) => r.id !== id))
    router.refresh()
  }

  async function resolveDuplicateReceipt(id: string, resolution: 'save_new' | 'use_existing' | 'cancel', items?: ReceiptLineItem[]) {
    await resolveDuplicateReceiptAction(id, resolution, items)
    setPendingReceiptImports((current) => current.filter((r) => r.id !== id))
    router.refresh()
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
    const { expense, notification } = await addExpenseAction({ amount, note, category, date: TODAY })
    setExpenses((current) => [...current, expense])
    if (notification) setNotifications((current) => [...current, notification])
    setExpenseOpen(false)
  }

  return (
    <div className={dark ? 'dark min-h-screen' : 'min-h-screen'}>
      <div className="min-h-screen bg-background text-foreground transition-colors">
        <div className="mx-auto flex min-h-screen max-w-[1440px]">
          <AppSidebar tab={tab} onTabChange={setTab} />

          <main className="min-w-0 flex-1 overflow-x-clip pb-24 lg:pb-8">
            <AppHeader
              title={title}
              date="Pátek 19. září 2026"
              dark={dark}
              onToggleDark={() => setDark(!dark)}
              notificationsOpen={notificationsOpen}
              onToggleNotifications={() => setNotificationsOpen((open) => !open)}
              hasUnread={notifications.some((notification) => notification.unread)}
              onProfileClick={() => setTab('Profil')}
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

            <div className="px-5 sm:px-8 lg:px-12">
              <div className="mb-7 lg:hidden">
                <p className="text-sm text-muted-foreground">Pátek 19. září 2026</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              </div>

              {tab === 'Domů' && (
                <>
                  <DashboardOverview
                    budget={budget}
                    spent={spent}
                    remaining={remaining}
                    completed={completed}
                    totalItems={items.length}
                    onShopping={() => setTab('Nákup')}
                    onExpense={() => setExpenseOpen(true)}
                  />
                  <SavingsInsight remaining={remaining} onAi={() => setTab('AI')} />
                  <MealPlan household={household} initialPlan={initialData.mealPlan} pantryItems={pantryItems} onAddIngredients={addIngredients} onMarkCooked={markMealCooked} />
                  <PriceWatch onStores={() => setTab('Obchody')} productPrices={productPrices} pantryItems={pantryItems} />
                  <QuickActions onShopping={() => setTab('Nákup')} onStores={() => setTab('Obchody')} onAi={() => setTab('AI')} />
                </>
              )}
              {tab === 'Nákup' && (
                <div className="mx-auto max-w-3xl space-y-5">
                  <ShoppingList
                    items={items}
                    newItem={newItem}
                    setNewItem={setNewItem}
                    addItem={addItem}
                    updateItem={updateItem}
                    removeItem={removeItem}
                    toggle={toggleItem}
                    lists={shoppingLists}
                    onAddList={addShoppingListName}
                    productPrices={productPrices}
                    remaining={remaining}
                    stores={stores}
                    userCoords={userLocation.coords}
                    completePurchase={completePurchase}
                  />
                  <Pantry items={pantryItems} onConfirm={confirmPantryItem} onRemove={removePantryItem} onMove={movePantryItem} />
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
                <div className="space-y-6">
                  <BudgetOverview
                    budget={budget}
                    setBudget={(value) => updateHousehold({ monthlyBudget: value })}
                    spent={spent}
                    expenses={expenses}
                    items={items}
                    onExpense={() => setExpenseOpen(true)}
                  />
                  <ExpenseHistory expenses={expenses} />
                  <ReceiptPending
                    items={pendingReceiptImports}
                    onRetry={retryReceiptImport}
                    onConfirmReview={confirmReceiptReview}
                    onResolveDuplicate={resolveDuplicateReceipt}
                    onCancel={cancelReceiptImport}
                  />
                  <ReceiptImport stores={stores} onImport={importReceipt} onUpload={uploadReceipt} />
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
                />
              )}
            </div>
          </main>
        </div>

        <MobileNav tab={tab} onTabChange={setTab} />

        {expenseOpen && <ExpenseModal onClose={() => setExpenseOpen(false)} onSave={saveExpense} />}
      </div>
    </div>
  )
}
