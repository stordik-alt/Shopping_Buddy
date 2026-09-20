'use client'

import { useState } from 'react'
import { AiAssistant } from '@/components/ai/ai-assistant'
import { BudgetOverview } from '@/components/budget/budget-overview'
import { ExpenseHistory } from '@/components/budget/expense-history'
import { ExpenseModal } from '@/components/budget/expense-modal'
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
import { createItem } from '@/lib/items'
import { initialExpenses, initialItems, initialNotifications, initialShoppingLists } from '@/lib/mock-data'
import type { Tab } from '@/lib/types'

export default function Page() {
  const [tab, setTab] = useState<Tab>('Domů')
  const [items, setItems] = useState(initialItems)
  const [dark, setDark] = useState(false)
  const [budget, setBudget] = useState(12000)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialNotifications)
  const [expenses, setExpenses] = useState(initialExpenses)
  const [newItem, setNewItem] = useState('')
  const [shoppingLists, setShoppingLists] = useState(initialShoppingLists)

  const spent = expenses.reduce((total, expense) => total + expense.amount, 0)
  const remaining = budget - spent
  const completed = items.filter((item) => item.done).length

  const title = tab === 'Domů' ? 'Dobré ráno, Lucie' : tab
  const subtitle = tab === 'Domů' ? 'Pojďme dnes ušetřit pár korun.' : 'Vše, co potřebujete mít pod kontrolou.'

  function addItem() {
    const name = newItem.trim()
    if (!name) return
    setItems((current) => [...current, createItem(name)])
    setNewItem('')
  }

  function updateItem(id: number, changes: Partial<(typeof items)[number]>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)))
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
                onRead={(id) => setNotifications((current) => current.map((notification) => (notification.id === id ? { ...notification, unread: false } : notification)))}
                onReadAll={() => setNotifications((current) => current.map((notification) => ({ ...notification, unread: false })))}
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
                  <MealPlan
                    onAddIngredients={(ingredients) => {
                      setItems((current) => [
                        ...current,
                        ...ingredients.map((ingredient) => createItem(ingredient.name, { detail: '1 ks · z jídelníčku', category: ingredient.category })),
                      ])
                      setTab('Nákup')
                    }}
                  />
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
                  removeItem={(id) => setItems((current) => current.filter((item) => item.id !== id))}
                  toggle={(id) => setItems((current) => current.map((item) => (item.id === id ? { ...item, done: !item.done } : item)))}
                  lists={shoppingLists}
                  onAddList={(name) => setShoppingLists((current) => [...current, name])}
                />
              )}
              {tab === 'Obchody' && <StoreDirectory />}
              {tab === 'Rozpočet' && (
                <div className="space-y-6">
                  <BudgetOverview budget={budget} setBudget={setBudget} spent={spent} expenses={expenses} items={items} onExpense={() => setExpenseOpen(true)} />
                  <ExpenseHistory expenses={expenses} />
                </div>
              )}
              {tab === 'AI' && <AiAssistant onShopping={() => setTab('Nákup')} />}
              {tab === 'Profil' && <HouseholdProfile />}
            </div>
          </main>
        </div>

        <MobileNav tab={tab} onTabChange={setTab} />

        {expenseOpen && (
          <ExpenseModal
            onClose={() => setExpenseOpen(false)}
            onSave={(amount, note, category) => {
              setExpenses((current) => [...current, { id: Date.now(), amount, note, category, date: TODAY }])
              setExpenseOpen(false)
            }}
          />
        )}
      </div>
    </div>
  )
}
