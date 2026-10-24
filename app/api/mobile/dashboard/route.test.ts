import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const getShoppingListState = vi.fn()
const getPantryItems = vi.fn()
const getHouseholdPurchaseHistory = vi.fn()
const getPendingReceiptImports = vi.fn()
const getMobileBudgetState = vi.fn()
const getMemberStoreSelection = vi.fn()
const getStockLevels = vi.fn()
const getProductPricesCached = vi.fn()
const getStandaloneOffersCached = vi.fn()
const getRestockDismissals = vi.fn()
const getRestockSuggestionsFor = vi.fn()
const estimatePantry = vi.fn()
const attentionItems = vi.fn()
vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/queries', () => ({
  getShoppingListState: (...args: unknown[]) => getShoppingListState(...args),
  getPantryItems: (...args: unknown[]) => getPantryItems(...args),
  getHouseholdPurchaseHistory: (...args: unknown[]) => getHouseholdPurchaseHistory(...args),
  getPendingReceiptImports: (...args: unknown[]) => getPendingReceiptImports(...args),
  getMobileBudgetState: (...args: unknown[]) => getMobileBudgetState(...args),
}))
vi.mock('@/lib/db/member-store-preferences', () => ({ getMemberStoreSelection: (...args: unknown[]) => getMemberStoreSelection(...args) }))
vi.mock('@/lib/db/cached-reads', () => ({
  getProductPricesCached: (...args: unknown[]) => getProductPricesCached(...args),
  getStandaloneOffersCached: (...args: unknown[]) => getStandaloneOffersCached(...args),
}))
vi.mock('@/lib/db/restock', () => ({
  getRestockDismissals: (...args: unknown[]) => getRestockDismissals(...args),
  getRestockSuggestionsFor: (...args: unknown[]) => getRestockSuggestionsFor(...args),
  getStockLevels: (...args: unknown[]) => getStockLevels(...args),
}))
vi.mock('@/lib/pantry-estimate', () => ({ estimatePantry: (...args: unknown[]) => estimatePantry(...args) }))
vi.mock('@/lib/attention', () => ({ attentionItems: (...args: unknown[]) => attentionItems(...args) }))
vi.mock('@/lib/today', () => ({ todayInPrague: () => '2026-10-24' }))

import { GET } from '@/app/api/mobile/dashboard/route'

describe('/api/mobile/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'owner' })
    getShoppingListState.mockResolvedValue({ listId: 'list-1', shoppingLists: ['Nákup'], items: [{ name: 'Mléko', done: false }, { name: 'Chléb', done: true }] })
    getPantryItems.mockResolvedValue([{ id: 'milk', tracking: 'normal', askedAt: null }, { id: 'bread', tracking: 'normal', askedAt: null }])
    getHouseholdPurchaseHistory.mockResolvedValue([])
    getPendingReceiptImports.mockResolvedValue([])
    getMobileBudgetState.mockResolvedValue({ period: { start: '2026-10-01', end: '2026-10-30' }, currency: 'CZK', budget: 1000, spent: 910, remaining: 90, categories: [] })
    getMemberStoreSelection.mockResolvedValue({ maxDistanceKm: null, chainIds: [], branches: [], priorityChainIds: [], maxShopStores: null })
    getStockLevels.mockResolvedValue([])
    getProductPricesCached.mockResolvedValue([])
    getStandaloneOffersCached.mockResolvedValue([])
    getRestockDismissals.mockResolvedValue([])
    getRestockSuggestionsFor.mockResolvedValue([])
    estimatePantry.mockReturnValue(new Map([['milk', { likelyGone: true }]]))
    attentionItems.mockReturnValue([{ id: 'receipts', kind: 'receipt', text: 'Účtenka čeká' }])
  })

  it('returns home summary data with household scoped list, pantry check, and weekly pace', async () => {
    const response = await GET(new Request('https://anitka.example/api/mobile/dashboard'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      today: '2026-10-24',
      weeklyAllowance: 90,
      list: { remaining: 1, completed: 1, pendingNames: ['Mléko'] },
      pantryItemCount: 2,
      pantryToCheck: 1,
      attention: [{ id: 'receipts' }],
      restockSuggestions: [],
      offers: [],
    })
    expect(getShoppingListState).toHaveBeenCalledWith('household-1')
    expect(getMemberStoreSelection).toHaveBeenCalledWith('member-1')
    expect(getProductPricesCached).toHaveBeenCalledWith({ names: ['Mléko'], runningDeals: false })
  })

  it('requires a household before reading dashboard data', async () => {
    mobileHouseholdForUser.mockResolvedValue(null)
    const response = await GET(new Request('https://anitka.example/api/mobile/dashboard'))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'household_required' })
    expect(getShoppingListState).not.toHaveBeenCalled()
  })
})
