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
  return request<{ user: MobileUser; household: { id: string; role: string } | null }>('/api/mobile/me')
}

export function getShoppingList() {
  return request<MobileShoppingList>('/api/mobile/shopping-list')
}

export function getBudgetSummary() {
  return request<MobileBudgetSummary>('/api/mobile/budget')
}

export function getPantry() {
  return request<MobilePantryState>('/api/mobile/pantry')
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
