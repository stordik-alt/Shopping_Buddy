import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireHousehold = vi.fn()
const getStandaloneOffersCached = vi.fn()

vi.mock('@/lib/auth/authorize', () => ({
  requireHousehold: (...args: unknown[]) => requireHousehold(...args),
}))
vi.mock('@/lib/db/cached-reads', () => ({
  getStandaloneOffersCached: (...args: unknown[]) => getStandaloneOffersCached(...args),
}))

import { standaloneOffersForListAction } from '@/app/actions/offers'

describe('standaloneOffersForListAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireHousehold.mockResolvedValue({ householdId: 'household-1', userId: 'user-1', memberId: 'member-1' })
    getStandaloneOffersCached.mockResolvedValue([])
  })

  it('loads only offers for the current list after authentication', async () => {
    await standaloneOffersForListAction(['Mléko', 'Chléb'])
    expect(requireHousehold).toHaveBeenCalledOnce()
    expect(getStandaloneOffersCached).toHaveBeenCalledWith(['Mléko', 'Chléb'])
  })

  it('rejects an invalid client-provided product list before reading offers', async () => {
    await expect(standaloneOffersForListAction(['Mléko', 42 as never])).rejects.toThrow('Neplatný seznam produktů.')
    expect(getStandaloneOffersCached).not.toHaveBeenCalled()
  })
})
