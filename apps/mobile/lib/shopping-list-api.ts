import type { ItemUnit } from '@anitka/shared/units'
import type { Recipe, RecipeSearchPage } from '../../../lib/recipes/types'
import type { RestockSuggestion } from '../../../lib/pantry-restock'
import type { ProductPrice } from '../../../lib/prices'
import type { StandaloneOffer } from '../../../lib/offers'
import type { ExpenseCategory } from '../../../lib/expense-categories'
import type { RecurringOccurrence, RecurringPayment, RecurringPaymentInput } from '../../../lib/recurring-payments'
import type { RecurringIncome, RecurringIncomeInput, RecurringIncomeOccurrence } from '../../../lib/recurring-incomes'
import type { BudgetLedger, ManualPurchaseInput, PurchaseRecord } from '../../../lib/types'
import type { ExpenseSplitPart } from '../../../lib/purchase-expenses'
import type { PocketInput } from '../../../lib/pocket-input'
import type { BudgetOutlook } from '../../../lib/types'
import type { PeriodConfig } from '../../../lib/budget-period'
import type { PeriodHistoryRow } from '../../../lib/budget-history'
import type { PocketAmount } from '../../../lib/budget-closing'
import type { UsualItem } from '../../../lib/usual-items'
import type { ItemCategory, PantryTracking } from '../../../lib/types'
import { clearAccessToken, getAccessToken } from './auth'
import { getApiUrl } from './config'

export type MobileShoppingItem = {
  id: string
  name: string
  quantity: number
  unit: ItemUnit
  done: boolean
  category?: ItemCategory
  productId?: string | null
  productTypes?: string[] | null
  pending?: boolean
}

export type MobileShoppingList = {
  listId: string
  items: MobileShoppingItem[]
  shoppingLists: string[]
}

export type MobileBudgetSummary = {
  currency: string
  period: { start: string; end: string }
  budget: number
  spent: number
  remaining: number
  categories: { category: string; total: number; limit: number | null; level: 'ok' | 'warning' | 'over' }[]
}
export type MobileBudgetCategoryLimits = Partial<Record<ExpenseCategory, number>>
export type MobileRecurringPayments = {
  today: string
  payments: RecurringPayment[]
  occurrences: RecurringOccurrence[]
}
export type MobileRecurringIncomes = {
  today: string
  payments: RecurringIncome[]
  occurrences: RecurringIncomeOccurrence[]
}
export type MobileBudgetLedger = BudgetLedger & { availableToSave: number; currentPeriodStart: string }
export type MobilePeriodSettings = { period: PeriodConfig; today: string; currentPeriodStart: string; canEdit: boolean }

export type MobileDashboardSummary = {
  today: string
  budget: MobileBudgetSummary
  weeklyAllowance: number | null
  list: { remaining: number; completed: number; pendingNames: string[] }
  pantryItemCount: number
  pantryToCheck: number
  attention: { id: string; kind: 'receipt' | 'deal-ending'; text: string }[]
  restockSuggestions: RestockSuggestion[]
  restockDismissed: string[]
  productPrices: ProductPrice[]
  offers: StandaloneOffer[]
}

export type MobileExpense = {
  id: string
  amount: number
  note: string
  category: string
  subcategory: string | null
  date: string
  editable: boolean
}
export type MobileBudgetIncome = {
  id: string
  amount: number
  description: string
  date: string
  status: 'planned' | 'actual'
  recurringIncomeId: string | null
  occurrenceDueDate: string | null
  editable: boolean
}
export type MobilePlannedExpense = {
  id: string
  amount: number
  note: string
  category: string
  date: string
  status: 'planned' | 'paid'
}
export type MobileBudgetPlanning = {
  period: { start: string; end: string; next: string }
  currency: string
  budget: number
  incomes: MobileBudgetIncome[]
  plannedExpenses: MobilePlannedExpense[]
}

export type MobilePantryItem = {
  id: string
  name: string
  category: ItemCategory
  subcategory: string | null
  productTypeKey: string | null
  hasImage: boolean
  quantity: number
  unit: ItemUnit
  location: string
  customPlaceId: string | null
  unitQuantity: number | null
  unitUnit: ItemUnit | null
  addedAt: string
  askedAt: string | null
  tracking: PantryTracking
  contents: { id: string; name: string; quantity: number; unit: ItemUnit }[]
  likelyGone: boolean
  needsCheck: boolean
  estimateReason: string | null
}

export type MobilePantryPlace = { key: string; name: string; area: string; custom: boolean; id?: string }
export type MobilePantryState = { places: MobilePantryPlace[]; items: MobilePantryItem[] }
export type MobilePantryStockLevel = { id: string; productTypeKey: string; typeName: string; minQuantity: number; maxQuantity: number; unit: ItemUnit }
export type MobilePantrySettings = {
  customPlaces: { id: string; area: string; name: string }[]
  hiddenLocations: string[]
  placeOptions: MobilePantryPlace[]
  locationCounts: Record<string, number>
  checkinDays: Partial<Record<'Potraviny' | 'Drogerie' | 'Děti' | 'Domácnost' | 'Ostatní', number>>
  subcategoryCheckinDays: Record<string, number>
  stockLevels: MobilePantryStockLevel[]
}
export type MobileRecipe = Recipe
export type MobileRecipeSearchPage = RecipeSearchPage
export type MobileMealType = 'Snídaně' | 'Oběd' | 'Večeře' | 'Svačina'
export type MobileMealPlan = {
  weekStart: string
  budgetLimit: number
  estimatedTotal: number
  pricingPending: boolean
  recommendedStores: string[]
  days: {
    day: string
    meals: {
      mealType: MobileMealType
      cooked: boolean
      recipe: {
        id: string
        name: string
        sourceName: string | null
        imageUrl: string | null
        sourceUrl: string | null
        servings: number | null
        selectedServings: number
        ingredients: { name: string; quantity: number; unit: ItemUnit; sourceMeasure: string | null }[]
      }
    }[]
  }[]
}
export type MobileMealPlanOptions = {
  budgetLimit: number
  dayCount: number
  startDayIndex?: number
  mealTypes: MobileMealType[]
  useStock: boolean
}

export type MobileUser = {
  id: string
  email: string
  name: string
  emailVerified: boolean
}
export type MobileDietKey = 'none' | 'vegetarian' | 'pescetarian' | 'vegan'
export type MobileDietAvoid = 'lactose' | 'gluten' | 'nuts' | 'eggs' | 'fish' | 'pork'
export type MobileMemberDiet = { diet: MobileDietKey; avoids: MobileDietAvoid[] }
export type MobileHouseholdMember = {
  id: string
  name: string
  role: 'owner' | 'member'
  age: number
  favoriteFoods: string[]
  dislikedFoods: string[]
  allergies: string[]
  diet: MobileMemberDiet
  removable: boolean
}
export type MobileHouseholdChild = { id: string; name: string; age: number; preferences: string; specialNeeds?: string }
export type MobileHouseholdPreferences = {
  preferredBrands: string[]
  preferredStores: string[]
  preferredProducts: string[]
  excludedProducts: string[]
  priceSensitivity: 'cheapest' | 'balanced' | 'quality_first'
  qualityPreference: 'standard' | 'premium'
  preferCzechProducts: boolean
}
export type MobileHouseholdProfileData = { members: MobileHouseholdMember[]; children: MobileHouseholdChild[]; preferences: MobileHouseholdPreferences }
export type MobileHouseholdProfile = { id: string; role: string; name: string; monthlyBudget: number; currency: string; profile?: MobileHouseholdProfileData }
export type MobileHouseholdInvitation = { id: string; email: string; expiresAt: string }
export type MobileAuditEntry = { id: string; action: string; actor: string | null; detail: Record<string, string | number | boolean | null>; createdAt: string }

export type MobileDealCategory = 'Potraviny' | 'Drogerie' | 'Děti' | 'Domácnost' | 'Ostatní'
export type MobileDealSort = 'name' | 'price' | 'discount' | 'store'
export type MobileProductSearchResult = {
  groups: import('../../../lib/product-search').ProductSearchGroup[]
  nearbyOnly: boolean
  hasNearbySelection: boolean
}
export type MobileDealsPage = {
  deals: {
    product: { productName: string }
    price: { dealPrice: number | null; regularPrice: number; store: string; dealValidUntil: string | null }
    isBestPrice: boolean
    cheapestAlternative: { store: string; price: number } | null
    recentLow: { status: string; low: number } | null
  }[]
  offers: { productName: string; store: string; storeId: string; dealPrice: number; validUntil: string }[]
  total: number
  page: number
  pageSize: number
  hasPreferences: boolean
}
export type MobileChainTile = { storeId: string; chain: string; branchCount: number; dealsCount: number; isFavorite: boolean }
export type MobileStoreSelection = {
  maxDistanceKm: number | null
  chainIds: string[]
  branches: { storeId: string; storeLocationId: string }[]
  priorityChainIds: string[]
  maxShopStores: number | null
}
export type MobileStorePreferenceData = { selection: MobileStoreSelection; chains: { id: string; chain: string; isOnline: boolean }[] }
export type MobileBranchPage = {
  rows: { id: string; storeId: string; chain: string; name: string; address: string; city: string; gps: { lat: number; lng: number } | null; hours: string | null; distanceKm: number | null; isFavorite: boolean }[]
  total: number
  page: number
}
export type MobileNotification = { id: string; title: string; detail: string; unread: boolean; kind: string | null }
export type MobilePurchase = PurchaseRecord

export class MobileApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  if (!token) throw new MobileApiError('Přihlaste se ke svému účtu ANITKA.', 401, 'not_signed_in')

  let response: Response
  try {
    const headers: Record<string, string> = Object.fromEntries(new Headers(init?.headers).entries())
    if (!(init?.body instanceof FormData)) headers['Content-Type'] = 'application/json'
    headers.Authorization = ['Bearer', token].join(' ')
    response = await fetch(`${getApiUrl()}${path}`, {
      ...init,
      headers,
    })
  } catch {
    throw new MobileApiError('Nepodařilo se připojit k serveru. Zkontrolujte připojení a zkuste to znovu.', 0, 'network_error')
  }

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    if (response.ok) throw new MobileApiError('Server vrátil neplatnou odpověď.', response.status, 'invalid_response')
  }
  if (!response.ok) {
    const code = body !== null && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : undefined
    const serverMessage = body !== null && typeof body === 'object' && 'message' in body && typeof body.message === 'string' ? body.message : undefined
    if (response.status === 401) await clearAccessToken()
    const message =
      response.status === 401
        ? 'Přihlášení vypršelo. Přihlaste se znovu.'
        : serverMessage
          ? serverMessage
        : response.status === 403
          ? 'Účet nemá ověřenou e-mailovou adresu.'
          : response.status === 409 && code === 'household_required'
            ? 'Účet zatím není připojený k domácnosti.'
            : response.status === 404 && code === 'product_not_found'
              ? 'K tomuto kódu jsme produkt nenašli. Zkuste položku zadat ručně.'
              : response.status === 400 && code === 'invalid_barcode'
                ? 'Čárový kód se nepodařilo ověřit. Zkuste ho naskenovat znovu.'
              : code === 'lookup_timeout' || code === 'lookup_unavailable'
                ? 'Produkt se nepodařilo vyhledat. Zkuste to znovu.'
                : 'Změnu se nepodařilo uložit. Zkuste to znovu.'
    throw new MobileApiError(message, response.status, code)
  }
  return body as T
}

export function getCurrentUser() {
  return request<{ user: MobileUser; household: MobileHouseholdProfile | null }>('/api/mobile/me')
}

export function updateHouseholdProfile(changes: { name?: string; monthlyBudget?: number }) {
  return request<{ household: MobileHouseholdProfile }>('/api/mobile/me', { method: 'PATCH', body: JSON.stringify(changes) })
}

export function updateHouseholdPreferences(changes: Partial<MobileHouseholdPreferences>) {
  return request<{ preferences: MobileHouseholdPreferences }>('/api/mobile/household-profile', { method: 'PATCH', body: JSON.stringify(changes) })
}

export function addHouseholdMember(input: { name: string; age: number; favoriteFoods?: string[]; dislikedFoods?: string[]; allergies?: string[] }) {
  return request<{ member: MobileHouseholdMember }>('/api/mobile/household-profile/members', { method: 'POST', body: JSON.stringify(input) })
}

export function updateHouseholdMemberDiet(memberId: string, diet: MobileMemberDiet) {
  return request<{ diet: MobileMemberDiet }>(`/api/mobile/household-profile/members/${encodeURIComponent(memberId)}`, { method: 'PATCH', body: JSON.stringify(diet) })
}

export function removeHouseholdMember(memberId: string) {
  return request<{ ok: true }>(`/api/mobile/household-profile/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' })
}

export function addHouseholdChild(input: { name: string; age: number; preferences: string; specialNeeds?: string }) {
  return request<{ child: MobileHouseholdChild }>('/api/mobile/household-profile/children', { method: 'POST', body: JSON.stringify(input) })
}

export function removeHouseholdChild(childId: string) {
  return request<{ ok: true }>(`/api/mobile/household-profile/children?id=${encodeURIComponent(childId)}`, { method: 'DELETE' })
}

export function getHouseholdInvitations() {
  return request<{ invitations: MobileHouseholdInvitation[] }>('/api/mobile/household-profile/invitations')
}

export function createHouseholdInvitation(email: string) {
  return request<{ invitation: MobileHouseholdInvitation; token: string; url: string }>('/api/mobile/household-profile/invitations', { method: 'POST', body: JSON.stringify({ email }) })
}

export function revokeHouseholdInvitation(invitationId: string) {
  return request<{ ok: true }>(`/api/mobile/household-profile/invitations/${encodeURIComponent(invitationId)}`, { method: 'DELETE' })
}

export function getHouseholdAuditLog() {
  return request<{ entries: MobileAuditEntry[] }>('/api/mobile/household-profile/audit-log')
}

export function resetHouseholdData(groups: string[], typedName: string) {
  return request<{ ok: true; photosFailed: number }>('/api/mobile/household-profile/reset-data', {
    method: 'POST',
    body: JSON.stringify({ groups, typedName }),
  })
}

export function deleteMobileAccount(email: string) {
  return request<{ ok: true; householdDeleted: boolean; photosFailed: number }>('/api/mobile/account', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export type MobileNotificationPreference = { key: string; label: string; description: string; enabled: boolean }

export function getNotificationPreferences() {
  return request<{ preferences: MobileNotificationPreference[] }>('/api/mobile/notification-preferences')
}

export function updateNotificationPreference(kind: string, enabled: boolean) {
  return request<{ kind: string; enabled: boolean }>('/api/mobile/notification-preferences', { method: 'PATCH', body: JSON.stringify({ kind, enabled }) })
}

export function sendTestPushNotification() {
  return request<{ ok: true }>('/api/mobile/push-subscription/test', { method: 'POST', body: JSON.stringify({}) })
}

export function getDevicePushStatus(token: string) {
  return request<{ enabled: boolean }>(`/api/mobile/push-subscription?token=${encodeURIComponent(token)}`)
}

export function registerDevicePush(token: string) {
  return request<{ ok: true }>('/api/mobile/push-subscription', { method: 'PUT', body: JSON.stringify({ token }) })
}

export function removeDevicePush(token: string) {
  return request<{ ok: true }>('/api/mobile/push-subscription', { method: 'DELETE', body: JSON.stringify({ token }) })
}

export function getNotifications() {
  return request<{ notifications: MobileNotification[] }>('/api/mobile/notifications')
}

export function getPurchaseHistory() {
  return request<{ purchases: MobilePurchase[] }>('/api/mobile/purchases')
}

export function createMobileManualPurchase(input: ManualPurchaseInput) {
  return request<{ purchase: MobilePurchase; expenses: MobileExpense[]; notifications: MobileNotification[]; pantryItems: MobilePantryItem[] }>('/api/mobile/purchases', { method: 'POST', body: JSON.stringify(input) })
}

export function updateMobilePurchaseItemExpenseSplits(itemId: string, splits: ExpenseSplitPart[]) {
  return request<{ expenses: MobileExpense[] }>(`/api/mobile/purchases/items/${encodeURIComponent(itemId)}/expense-splits`, { method: 'PATCH', body: JSON.stringify({ splits }) })
}

export function recordMobilePurchaseExpenses(purchaseId: string) {
  return request<{ expenses: MobileExpense[]; notifications: MobileNotification[] }>(`/api/mobile/purchases/${encodeURIComponent(purchaseId)}`, { method: 'POST', body: JSON.stringify({}) })
}

export function deleteMobilePurchase(purchaseId: string) {
  return request<{ date: string }>(`/api/mobile/purchases/${encodeURIComponent(purchaseId)}`, { method: 'DELETE' })
}

export function dismissNotification(id?: string) {
  const query = id ? `?id=${encodeURIComponent(id)}` : ''
  return request<{ ok: true }>(`/api/mobile/notifications${query}`, { method: 'DELETE' })
}

export function getUsualItems() {
  return request<{ suggestions: UsualItem[] }>('/api/mobile/usual-items')
}

export function clearDoneShoppingItems() {
  return request<{ removed: number }>('/api/mobile/shopping-list/clear-done', { method: 'POST' })
}

export function getDealsPage(input: { category?: MobileDealCategory | 'all'; chain?: string | null; sort?: MobileDealSort; page?: number; query?: string; forMe?: boolean } = {}) {
  const params = new URLSearchParams({
    category: input.category ?? 'all',
    sort: input.sort ?? 'name',
    page: String(input.page ?? 1),
    forMe: String(input.forMe ?? false),
  })
  if (input.chain) params.set('chain', input.chain)
  if (input.query?.trim()) params.set('query', input.query.trim())
  return request<MobileDealsPage>(`/api/mobile/deals?${params.toString()}`)
}

export function getStoreChains(city = '') {
  const params = new URLSearchParams()
  if (city.trim()) params.set('city', city.trim())
  return request<{ chains: MobileChainTile[] }>(`/api/mobile/stores${params.size ? `?${params.toString()}` : ''}`)
}

export function getStoreBranches(city: string, chainId: string, page = 1) {
  const params = new URLSearchParams({ chainId, page: String(page) })
  if (city.trim()) params.set('city', city.trim())
  return request<MobileBranchPage>(`/api/mobile/stores?${params.toString()}`)
}

export function getStorePreferences() {
  return request<MobileStorePreferenceData>('/api/mobile/store-preferences')
}

export function searchProducts(input: { query: string; onlyNearby: boolean; category?: ItemCategory }) {
  return request<MobileProductSearchResult>('/api/mobile/product-search', { method: 'POST', body: JSON.stringify(input) })
}

export function getShoppingPlanPins() {
  return request<{ pins: import('../../../lib/db/shopping-plan').PinRecord[] }>('/api/mobile/shopping-plan')
}

export function buildShoppingPlan(input: { maxStores: number; priorityChainIds: string[] }) {
  return request<import('../../../lib/db/shopping-plan').PlanResult>('/api/mobile/shopping-plan', { method: 'POST', body: JSON.stringify({ action: 'build', ...input }) })
}

export function pinShoppingProduct(input: { itemId: string; storeId: string; productId: string }) {
  return request<{ ok: true }>('/api/mobile/shopping-plan', { method: 'POST', body: JSON.stringify({ action: 'pin', ...input }) })
}

export function unpinShoppingProduct(input: { itemId: string; storeId: string }) {
  return request<{ ok: true }>('/api/mobile/shopping-plan', { method: 'POST', body: JSON.stringify({ action: 'unpin', ...input }) })
}

export function updateStorePreferences(selection: { chainIds: string[]; locationIds: string[]; priorityChainIds: string[]; maxDistanceKm: number | null; maxShopStores: number | null }) {
  return request<{ selection: MobileStoreSelection }>('/api/mobile/store-preferences', { method: 'PATCH', body: JSON.stringify(selection) })
}

export function getShoppingList() {
  return request<MobileShoppingList>('/api/mobile/shopping-list')
}

export function getBudgetSummary() {
  return request<MobileBudgetSummary>('/api/mobile/budget')
}

export function getBudgetCategoryLimits() {
  return request<{ limits: MobileBudgetCategoryLimits }>('/api/mobile/budget/category-limits')
}

export function updateBudgetCategoryLimit(category: ExpenseCategory, amount: number | null) {
  return request<{ limits: MobileBudgetCategoryLimits }>('/api/mobile/budget/category-limits', {
    method: 'PATCH',
    body: JSON.stringify({ category, amount }),
  })
}

export function getRecurringPayments() {
  return request<MobileRecurringPayments>('/api/mobile/budget/recurring-payments')
}

export function addRecurringPayment(input: RecurringPaymentInput) {
  return request<{ payment: RecurringPayment }>('/api/mobile/budget/recurring-payments', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateRecurringPayment(id: string, input: RecurringPaymentInput) {
  return request<{ payment: RecurringPayment }>(`/api/mobile/budget/recurring-payments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'save', ...input }),
  })
}

export function stopRecurringPayment(id: string) {
  return request<{ ok: true }>(`/api/mobile/budget/recurring-payments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'stop' }),
  })
}

export function confirmRecurringPayment(id: string, dueDate: string, amount: number, date: string) {
  return request<{ expense: MobileExpense; occurrence: RecurringOccurrence }>(`/api/mobile/budget/recurring-payments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'confirm', dueDate, amount, date }),
  })
}

export function skipRecurringPayment(id: string, dueDate: string) {
  return request<{ occurrence: RecurringOccurrence }>(`/api/mobile/budget/recurring-payments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'skip', dueDate }),
  })
}

export function getRecurringIncomes() {
  return request<MobileRecurringIncomes>('/api/mobile/budget/recurring-incomes')
}

export function addRecurringIncome(input: RecurringIncomeInput) {
  return request<{ payment: RecurringIncome }>('/api/mobile/budget/recurring-incomes', { method: 'POST', body: JSON.stringify(input) })
}

export function updateRecurringIncome(id: string, input: RecurringIncomeInput) {
  return request<{ payment: RecurringIncome }>(`/api/mobile/budget/recurring-incomes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ action: 'save', ...input }) })
}

export function stopRecurringIncome(id: string) {
  return request<{ ok: true }>(`/api/mobile/budget/recurring-incomes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ action: 'stop' }) })
}

export function confirmRecurringIncome(id: string, dueDate: string, amount: number, date: string) {
  return request<{ income: MobileBudgetIncome; occurrence: RecurringIncomeOccurrence }>(`/api/mobile/budget/recurring-incomes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ action: 'confirm', dueDate, amount, date }) })
}

export function skipRecurringIncome(id: string, dueDate: string) {
  return request<{ occurrence: RecurringIncomeOccurrence }>(`/api/mobile/budget/recurring-incomes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ action: 'skip', dueDate }) })
}

export function getBudgetLedger(period?: string) {
  const query = period ? `?period=${encodeURIComponent(period)}` : ''
  return request<MobileBudgetLedger>(`/api/mobile/budget/ledger${query}`)
}

export function addPocket(input: PocketInput) {
  return request<{ ok: true; id: string }>('/api/mobile/budget/pockets', { method: 'POST', body: JSON.stringify(input) })
}

export function updatePocket(id: string, input: PocketInput) {
  return request<{ ok: true }>(`/api/mobile/budget/pockets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ action: 'save', ...input }) })
}

export function archivePocket(id: string) {
  return request<{ ok: true }>(`/api/mobile/budget/pockets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ action: 'archive' }) })
}

export function transferPocket(id: string, action: 'deposit' | 'withdraw', amount: number) {
  return request<{ ok: true }>(`/api/mobile/budget/pockets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ action, amount }) })
}

export function getBudgetHistory() {
  return request<{ history: PeriodHistoryRow[] }>('/api/mobile/budget/history')
}

export function getBudgetOutlook() {
  return request<{ outlook: BudgetOutlook }>('/api/mobile/budget/outlook')
}

export function setPlannedCarry(periodStart: string, amount: number | null) {
  return request<{ ok: true }>('/api/mobile/budget/outlook', { method: 'PATCH', body: JSON.stringify({ periodStart, amount }) })
}

export function getBudgetPeriodSettings() {
  return request<MobilePeriodSettings>('/api/mobile/budget/period-settings')
}

export function updateBudgetPeriod(period: PeriodConfig) {
  return request<MobilePeriodSettings>('/api/mobile/budget/period-settings', { method: 'PATCH', body: JSON.stringify({ period }) })
}

export function closeBudgetPeriod(input: { periodStart: string; deposits: PocketAmount[]; withdrawals: PocketAmount[]; carryOn: number }) {
  return request<{ ok: true }>('/api/mobile/budget/period-closing', { method: 'POST', body: JSON.stringify({ action: 'close', ...input }) })
}

export function reopenBudgetPeriod(periodStart: string) {
  return request<{ ok: true }>('/api/mobile/budget/period-closing', { method: 'POST', body: JSON.stringify({ action: 'reopen', periodStart }) })
}

export function getDashboardSummary() {
  return request<MobileDashboardSummary>('/api/mobile/dashboard')
}

export function dismissRestockSuggestion(input: { productTypeKey: string; productId: string; validUntil: string }) {
  return request<{ dismissed: string[] }>('/api/mobile/restock-dismissals', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function getExpenses(period?: string) {
  const query = period ? `?period=${encodeURIComponent(period)}` : ''
  return request<{ period: { start: string; end: string; next: string }; expenses: MobileExpense[] }>(`/api/mobile/expenses${query}`)
}

export function addExpense(input: Omit<MobileExpense, 'id' | 'editable'>) {
  return request<{ expense: MobileExpense; notifications: MobileNotification[] }>('/api/mobile/expenses', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateExpense(expenseId: string, input: Omit<MobileExpense, 'id' | 'editable'>) {
  return request<{ expense: MobileExpense }>(`/api/mobile/expenses/${encodeURIComponent(expenseId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteExpense(expenseId: string) {
  return request<{ ok: true }>(`/api/mobile/expenses/${encodeURIComponent(expenseId)}`, { method: 'DELETE' })
}

export function getBudgetPlanning(period?: string) {
  const query = period ? `?period=${encodeURIComponent(period)}` : ''
  return request<MobileBudgetPlanning>(`/api/mobile/budget/planning${query}`)
}

export function addBudgetIncome(input: { amount: number; description: string; date: string; status: 'planned' | 'actual' }) {
  return request<{ income: MobileBudgetIncome }>('/api/mobile/budget/planning', { method: 'POST', body: JSON.stringify({ kind: 'income', ...input }) })
}

export function addPlannedExpense(input: { amount: number; note: string; category: string; date: string }) {
  return request<{ plannedExpense: MobilePlannedExpense }>('/api/mobile/budget/planning', { method: 'POST', body: JSON.stringify({ kind: 'plannedExpense', ...input }) })
}

export function updateBudgetIncome(id: string, input: { amount: number; description: string; date: string }) {
  return request<{ income: MobileBudgetIncome }>(`/api/mobile/budget/planning/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ kind: 'income', action: 'update', ...input }) })
}

export function receiveBudgetIncome(id: string, date?: string) {
  return request<{ income: MobileBudgetIncome }>(`/api/mobile/budget/planning/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ kind: 'income', action: 'receive', ...(date ? { date } : {}) }) })
}

export function receiveRecurringBudgetIncome(id: string, amount: number, date: string) {
  return request<{ income: MobileBudgetIncome }>(`/api/mobile/budget/planning/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ kind: 'income', action: 'receive', amount, date }) })
}

export function deleteBudgetIncome(id: string) {
  return request<{ ok: true }>(`/api/mobile/budget/planning/${encodeURIComponent(id)}?kind=income`, { method: 'DELETE' })
}

export function updatePlannedExpense(id: string, input: { amount: number; note: string; category: string; date: string }) {
  return request<{ plannedExpense: MobilePlannedExpense }>(`/api/mobile/budget/planning/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ kind: 'plannedExpense', action: 'update', ...input }) })
}

export function payPlannedExpense(id: string, amount?: number, date?: string) {
  return request<{ plannedExpense: MobilePlannedExpense; notifications: MobileNotification[] }>(`/api/mobile/budget/planning/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ kind: 'plannedExpense', action: 'pay', ...(amount !== undefined ? { amount } : {}), ...(date ? { date } : {}) }) })
}

export function deletePlannedExpense(id: string) {
  return request<{ ok: true }>(`/api/mobile/budget/planning/${encodeURIComponent(id)}?kind=plannedExpense`, { method: 'DELETE' })
}

export function getPantry() {
  return request<MobilePantryState>('/api/mobile/pantry')
}

export function getPantrySettings() {
  return request<MobilePantrySettings>('/api/mobile/pantry-settings')
}

export function updatePantrySettings(change: Record<string, unknown>) {
  return request<MobilePantrySettings>('/api/mobile/pantry-settings', { method: 'PATCH', body: JSON.stringify(change) })
}

export function addPantryItem(input: { name: string; quantity: number; unit: ItemUnit; category: 'Potraviny' | 'Drogerie' | 'Děti' | 'Domácnost' | 'Ostatní'; placeKey: string }) {
  return request<{ ok: true }>('/api/mobile/pantry', { method: 'POST', body: JSON.stringify(input) })
}

export function removePantryItem(itemId: string) {
  return request<{ ok: true }>(`/api/mobile/pantry/${encodeURIComponent(itemId)}`, { method: 'DELETE' })
}

export function searchRecipes(query: string, page = 1) {
  return request<MobileRecipeSearchPage>(`/api/mobile/recipes?q=${encodeURIComponent(query)}&page=${page}`)
}

export function getRecipe(recipeId: string) {
  return request<MobileRecipe>(`/api/mobile/recipes/${encodeURIComponent(recipeId)}`)
}

export function getMealPlan() {
  return request<{ plan: MobileMealPlan | null }>('/api/mobile/meal-plan')
}

export function generateMealPlan(options: MobileMealPlanOptions) {
  return request<{ plan: MobileMealPlan }>('/api/mobile/meal-plan', {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

export function setMealServings(day: string, mealType: MobileMealType, servings: number) {
  return request<{ plan: MobileMealPlan }>('/api/mobile/meal-plan/servings', {
    method: 'PATCH',
    body: JSON.stringify({ day, mealType, servings }),
  })
}

export function updatePantryItem(itemId: string, change: { quantity: number } | { placeKey: string }) {
  return request<{ ok: true }>(`/api/mobile/pantry/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(change),
  })
}

export function reviewPantry(input: { reviewedIds: string[]; goneIds: string[]; quantities: { id: string; quantity: number }[] }) {
  return request<{ removed: number; confirmed: number; adjusted: number }>('/api/mobile/pantry/review', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function addShoppingItem(name: string, clientId: string, quantity = 1, unit: ItemUnit = 'ks', details?: { category?: ItemCategory; detail?: string; selection?: { kind: 'product'; productId: string } | { kind: 'type'; productTypeKey: string } }) {
  return request<{ item: MobileShoppingItem }>('/api/mobile/shopping-list', {
    method: 'POST',
    body: JSON.stringify({ name, clientId, ...(quantity !== 1 && { quantity }), ...(unit !== 'ks' && { unit }), ...details }),
  })
}

export function lookupBarcode(barcode: string) {
  return request<{ name: string }>('/api/mobile/barcode', {
    method: 'POST',
    body: JSON.stringify({ barcode }),
  })
}

export type MobileReceiptImport = {
  id: string
  status:
    | 'pending_review' | 'imported' | 'discarded' | 'uploaded' | 'ocr_processing' | 'ocr_completed' | 'ocr_failed'
    | 'parsing' | 'parsed' | 'parsing_failed' | 'validating' | 'review_required' | 'duplicate_review' | 'completed' | 'cancelled'
  hasImage: boolean
  errorMessage: string | null
  extracted: { date: string | null; total: number | null; items: { name: string; quantity: number; unit: ItemUnit }[] } | null
  stalled: boolean
}

export function getPendingReceiptImports() {
  return request<{ receipts: MobileReceiptImport[] }>('/api/mobile/receipts')
}

export function uploadReceiptPhoto(uri: string) {
  const body = new FormData()
  body.append('file', { uri, name: 'receipt.jpg', type: 'image/jpeg' } as unknown as Blob)
  return request<{ receipt: MobileReceiptImport }>('/api/mobile/receipts', { method: 'POST', body })
}

export function processReceiptImport(receiptId: string, retry: boolean) {
  return request<{ receipt: MobileReceiptImport }>(`/api/mobile/receipts/${encodeURIComponent(receiptId)}`, {
    method: 'POST',
    body: JSON.stringify({ retry }),
  })
}

export function updateShoppingItem(itemId: string, changes: { quantity?: number; unit?: ItemUnit }) {
  return request<{ ok: true }>(`/api/mobile/shopping-list/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })
}

export function toggleShoppingItem(itemId: string, done: boolean) {
  return request<{ ok: true }>(`/api/mobile/shopping-list/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ done }),
  })
}
