import type { ItemUnit } from '@anitka/shared/units'
import type { Recipe, RecipeSearchPage } from '../../../lib/recipes/types'
import { clearAccessToken, getAccessToken } from './auth'
import { getApiUrl } from './config'

export type MobileShoppingItem = {
  id: string
  name: string
  quantity: number
  unit: ItemUnit
  done: boolean
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
  quantity: number
  unit: ItemUnit
  location: string
  customPlaceId: string | null
  unitQuantity: number | null
  unitUnit: ItemUnit | null
}

export type MobilePantryPlace = { key: string; name: string; area: string; custom: boolean; id?: string }
export type MobilePantryState = { places: MobilePantryPlace[]; items: MobilePantryItem[] }
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

export type MobileDealCategory = 'Potraviny' | 'Drogerie' | 'Děti' | 'Domácnost' | 'Ostatní'
export type MobileDealSort = 'name' | 'price' | 'discount' | 'store'
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
export type MobileBranchPage = {
  rows: { id: string; storeId: string; chain: string; name: string; address: string; city: string; gps: { lat: number; lng: number } | null; hours: string | null; distanceKm: number | null; isFavorite: boolean }[]
  total: number
  page: number
}
export type MobileNotification = { id: string; title: string; detail: string; unread: boolean; kind: string | null }
export type MobilePurchase = {
  id: string
  date: string
  store?: string
  total: number
  discount?: number
  needsBudgetRecording?: boolean
  items: { id: string; name: string; quantity: number; unit: ItemUnit; price: number; category?: string | null }[]
}

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

export type MobileNotificationPreference = { key: string; label: string; description: string; enabled: boolean }

export function getNotificationPreferences() {
  return request<{ preferences: MobileNotificationPreference[] }>('/api/mobile/notification-preferences')
}

export function updateNotificationPreference(kind: string, enabled: boolean) {
  return request<{ kind: string; enabled: boolean }>('/api/mobile/notification-preferences', { method: 'PATCH', body: JSON.stringify({ kind, enabled }) })
}

export function getNotifications() {
  return request<{ notifications: MobileNotification[] }>('/api/mobile/notifications')
}

export function getPurchaseHistory() {
  return request<{ purchases: MobilePurchase[] }>('/api/mobile/purchases')
}

export function dismissNotification(id?: string) {
  const query = id ? `?id=${encodeURIComponent(id)}` : ''
  return request<{ ok: true }>(`/api/mobile/notifications${query}`, { method: 'DELETE' })
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

export function getShoppingList() {
  return request<MobileShoppingList>('/api/mobile/shopping-list')
}

export function getBudgetSummary() {
  return request<MobileBudgetSummary>('/api/mobile/budget')
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

export function addShoppingItem(name: string, clientId: string) {
  return request<{ item: MobileShoppingItem }>('/api/mobile/shopping-list', {
    method: 'POST',
    body: JSON.stringify({ name, clientId }),
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
