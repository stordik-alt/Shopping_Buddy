import type { ItemUnit } from '@anitka/shared/units'
import { clearAccessToken, getAccessToken } from './auth'
import { getApiUrl } from './config'

export type MobileShoppingItem = {
  id: string
  name: string
  quantity: number
  unit: ItemUnit
  done: boolean
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
    response = await fetch(`${getApiUrl()}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers, Authorization: ['Bearer', token].join(' ') },
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
    if (response.status === 401) await clearAccessToken()
    const message =
      response.status === 401
        ? 'Přihlášení vypršelo. Přihlaste se znovu.'
        : response.status === 403
          ? 'Účet nemá ověřenou e-mailovou adresu.'
          : response.status === 409 && code === 'household_required'
            ? 'Účet zatím není připojený k domácnosti.'
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
