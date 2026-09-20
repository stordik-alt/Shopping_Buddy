'use client'

import { useState } from 'react'
import { addExpenseAction } from '@/app/actions/budget'
import { addChildAction, addHouseholdMemberAction, removeChildAction, removeHouseholdMemberAction, updateHouseholdAction, updateHouseholdPreferencesAction } from '@/app/actions/household'
import { markAllNotificationsReadAction, markNotificationReadAction } from '@/app/actions/notifications'
import { addShoppingItemAction, addShoppingListAction, removeShoppingItemAction, toggleShoppingItemAction, updateShoppingItemAction } from '@/app/actions/shopping'
import { AiAssistant } from '@/components/ai/ai-assistant'
import { BudgetOverview } from '@/components/budget/budget-overview'
import { ExpenseHistory } from '@/components/budget/expense-history'
import { ExpenseModal } from '@/components/budget/expense-modal'
import { PurchaseHistory } from '@/components/budget/purchase-history'
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
import { ShoppingList } from '@/components/shopping/shopping-list'
import { StoreDirectory } from '@/components/stores/store-directory'
import { TODAY } from '@/lib/budget'
import type { HouseholdData } from '@/lib/db/queries'
import type { Item, Tab } from '@/lib/types'

export function AppShell({ initialData }: { initialData: HouseholdData }) {
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

  const budget = household.monthlyBudget
  const spent = expenses.reduce((total, expense) => total + expense.amount, 0)
  const remaining = budget - spent
  const completed = items.filter((item) => item.done).length

  const title = tab === 'Domů' ? 'Dobré ráno, Lucie' : tab
  const subtitle = tab === 'Domů' ? 'Pojďme dnes ušetřit pár korun.' : 'Vše, co potřebujete mít pod kontrolou.'

  async function addItem() {
    const name = newItem.trim()
    if (!name) return
    setNewItem('')
    const item = await addShoppingItemAction(initialData.mainListId, name)
    setItems((current) => [...current, item])
  }

  function addIngredients(ingredients: { name: string; category: Item['category'] }[]) {
    Promise.all(
      ingredients.map((ingredient) =>
        addShoppingItemAction(initialData.mainListId, ingredient.name, { detail: '1 ks · z jídelníčku', category: ingredient.category }),
      ),
    ).then((created) => setItems((current) => [...current, ...created]))
    setTab('Nákup')
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

  function addShoppingListName(name: string) {
    setShoppingLists((current) => [...current, name])
    addShoppingListAction(household.id, name)
  }

  function updateHousehold(changes: { name?: string; monthlyBudget?: number }) {
    setHousehold((current) => ({ ...current, ...changes }))
    updateHouseholdAction(household.id, changes)
  }

  async function addMember(member: { name: string; age: number; favoriteFoods: string[]; dislikedFoods: string[]; allergies: string[] }) {
    const created = await addHouseholdMemberAction(household.id, member)
    setHousehold((current) => ({ ...current, members: [...current.members, created] }))
  }

  function removeMember(id: string) {
    setHousehold((current) => ({ ...current, members: current.members.filter((member) => member.id !== id) }))
    removeHouseholdMemberAction(id)
  }

  async function addChild(child: { name: string; age: number; preferences: string; specialNeeds?: string }) {
    const created = await addChildAction(household.id, child)
    setHousehold((current) => ({ ...current, children: [...current.children, created] }))
  }

  function removeChild(id: string) {
    setHousehold((current) => ({ ...current, children: current.children.filter((child) => child.id !== id) }))
    removeChildAction(id)
  }

  function updatePreferences(changes: Partial<typeof household.preferences>) {
    setHousehold((current) => ({ ...current, preferences: { ...current.preferences, ...changes } }))
    updateHouseholdPreferencesAction(household.id, changes)
  }

  function readNotification(id: string) {
    setNotifications((current) => current.map((notification) => (notification.id === id ? { ...notification, unread: false } : notification)))
    markNotificationReadAction(id)
  }

  function readAllNotifications() {
    setNotifications((current) => current.map((notification) => ({ ...notification, unread: false })))
    markAllNotificationsReadAction(household.id)
  }

  async function saveExpense(amount: number, note: string, category: Item['category']) {
    const expense = await addExpenseAction(household.id, { amount, note, category, date: TODAY })
    setExpenses((current) => [...current, expense])
    setExpenseOpen(false)
  }

  return (
    <div className={dark ? 'dark min-h-screen' : 'min-h-screen'}>
      <div className="min-h-screen bg-background text-foreground transition-colors">
        <div className="mx-auto flex min-h-screen max-w-[1440px]">
          <AppSidebar tab={tab} onTabChange={setTab} />

          <main className="min-w-0 flex-1 pb-24 lg:pb-8">
            <AppHeader
              title={title}
              date="Pátek 19. září 2026"
              dark={dark}
              onToggleDark={() => setDark(!dark)}
              notificationsOpen={notificationsOpen}
              onToggleNotifications={() => setNotificationsOpen((open) => !open)}
              hasUnread={notifications.some((notification) => notification.unread)}
              onProfileClick={() => setTab('Profil')}
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
                  <MealPlan onAddIngredients={addIngredients} />
                  <PriceWatch onStores={() => setTab('Obchody')} />
                  <QuickActions onShopping={() => setTab('Nákup')} onStores={() => setTab('Obchody')} onAi={() => setTab('AI')} />
                </>
              )}
              {tab === 'Nákup' && (
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
                />
              )}
              {tab === 'Obchody' && <StoreDirectory />}
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
                  <PurchaseHistory records={initialData.purchaseHistory} />
                </div>
              )}
              {tab === 'AI' && <AiAssistant onShopping={() => setTab('Nákup')} />}
              {tab === 'Profil' && (
                <HouseholdProfile
                  household={household}
                  onUpdateHousehold={updateHousehold}
                  onAddMember={addMember}
                  onRemoveMember={removeMember}
                  onAddChild={addChild}
                  onRemoveChild={removeChild}
                  onUpdatePreferences={updatePreferences}
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
