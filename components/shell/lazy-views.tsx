'use client'

import dynamic from 'next/dynamic'

// Everything the app shell shows inside a section (or in a dialog) is loaded as its own chunk, so the
// first paint only ships the navigation, the header and the section actually opened. Server rendering
// stays on (the default), so the opened section is still in the initial HTML; the fallback only shows
// while switching to a section whose code has not been fetched yet.
function ViewSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-3 py-2">
      <span className="sr-only">Načítám…</span>
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
    </div>
  )
}

// Dialogs render nothing until the user opens them; no placeholder is needed while they load.
const noFallback = () => null

const loading = ViewSkeleton

// Domů
export const TodayAttention = dynamic(() => import('@/components/dashboard/today-attention').then((m) => m.TodayAttention), { loading })
export const DashboardOverview = dynamic(() => import('@/components/dashboard/dashboard-overview').then((m) => m.DashboardOverview), { loading })
export const QuickOutOfStock = dynamic(() => import('@/components/dashboard/quick-out-of-stock').then((m) => m.QuickOutOfStock), { loading })
export const PriceWatch = dynamic(() => import('@/components/dashboard/price-watch').then((m) => m.PriceWatch), { loading })
export const SpendingBreakdown = dynamic(() => import('@/components/dashboard/spending-breakdown').then((m) => m.SpendingBreakdown), { loading })
export const SavingsInsight = dynamic(() => import('@/components/dashboard/savings-insight').then((m) => m.SavingsInsight), { loading })

// Nákup
export const PantryPrompt = dynamic(() => import('@/components/shopping/pantry-prompt').then((m) => m.PantryPrompt), { loading })
export const UsualItems = dynamic(() => import('@/components/shopping/usual-items').then((m) => m.UsualItems), { loading })
export const ShoppingList = dynamic(() => import('@/components/shopping/shopping-list').then((m) => m.ShoppingList), { loading })
export const PurchaseHistory = dynamic(() => import('@/components/budget/purchase-history').then((m) => m.PurchaseHistory), { loading })
export const ReceiptImport = dynamic(() => import('@/components/budget/receipt-import').then((m) => m.ReceiptImport), { loading })
export const ReceiptListSuggestions = dynamic(() => import('@/components/budget/receipt-list-suggestions').then((m) => m.ReceiptListSuggestions), { loading })
export const ReceiptPending = dynamic(() => import('@/components/budget/receipt-pending').then((m) => m.ReceiptPending), { loading })

// Zásoby, Akce, Obchody, Recepty, AI, Profil
export const Pantry = dynamic(() => import('@/components/shopping/pantry').then((m) => m.Pantry), { loading })
export const DealsTab = dynamic(() => import('@/components/deals/deals-tab').then((m) => m.DealsTab), { loading })
export const StoreDirectory = dynamic(() => import('@/components/stores/store-directory').then((m) => m.StoreDirectory), { loading })
export const Recipes = dynamic(() => import('@/components/recipes/recipes-entry').then((m) => m.Recipes), { loading })
export const AiAssistant = dynamic(() => import('@/components/ai/ai-assistant').then((m) => m.AiAssistant), { loading })
export const HouseholdProfile = dynamic(() => import('@/components/household/household-profile').then((m) => m.HouseholdProfile), { loading })

// Rozpočet
export const BudgetOverview = dynamic(() => import('@/components/budget/budget-overview').then((m) => m.BudgetOverview), { loading })
export const CategorySnapshot = dynamic(() => import('@/components/budget/category-snapshot').then((m) => m.CategorySnapshot), { loading })
export const RecurringPayments = dynamic(() => import('@/components/budget/recurring-payments').then((m) => m.RecurringPayments), { loading })
export const ExpenseLedger = dynamic(() => import('@/components/budget/expense-ledger').then((m) => m.ExpenseLedger), { loading })

// Panels and dialogs opened on demand
export const NotificationPanel = dynamic(() => import('@/components/notifications/notification-panel').then((m) => m.NotificationPanel), { loading: noFallback })
export const CategoryLimitsModal = dynamic(() => import('@/components/budget/category-limits-modal').then((m) => m.CategoryLimitsModal), { loading: noFallback })
export const RecurringPaymentModal = dynamic(() => import('@/components/budget/recurring-payment-modal').then((m) => m.RecurringPaymentModal), { loading: noFallback })
export const ExpenseModal = dynamic(() => import('@/components/budget/expense-modal').then((m) => m.ExpenseModal), { loading: noFallback })
