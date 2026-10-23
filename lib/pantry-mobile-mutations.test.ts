import { beforeEach, describe, expect, it, vi } from 'vitest'

const itemFindFirst = vi.fn()
const placeFindFirst = vi.fn()
const update = vi.fn()
const set = vi.fn()
const where = vi.fn()
const returning = vi.fn()

vi.mock('@/lib/db/client', () => ({
  getDb: () => ({
    query: {
      pantryItems: { findFirst: (...args: unknown[]) => itemFindFirst(...args) },
      pantryPlaces: { findFirst: (...args: unknown[]) => placeFindFirst(...args) },
    },
    update: (...args: unknown[]) => update(...args),
  }),
}))

import { PantryInputError, PantryResourceNotFoundError, updatePantryItemForHousehold } from '@/lib/pantry-mobile-mutations'

const householdId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const itemId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const placeId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

describe('updatePantryItemForHousehold', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    itemFindFirst.mockResolvedValue({ id: itemId })
    placeFindFirst.mockResolvedValue({ id: placeId })
    update.mockReturnValue({ set })
    set.mockReturnValue({ where })
    where.mockReturnValue({ returning })
    returning.mockResolvedValue([{ id: itemId }])
  })

  it('rejects items that are not owned by the household before writing', async () => {
    itemFindFirst.mockResolvedValue(null)
    await expect(updatePantryItemForHousehold(householdId, itemId, { quantity: 2 })).rejects.toBeInstanceOf(PantryResourceNotFoundError)
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects negative stock without changing the item', async () => {
    await expect(updatePantryItemForHousehold(householdId, itemId, { quantity: -0.1 })).rejects.toBeInstanceOf(PantryInputError)
    expect(update).not.toHaveBeenCalled()
  })

  it('persists an absolute quantity, including zero', async () => {
    await updatePantryItemForHousehold(householdId, itemId, { quantity: 0 })
    expect(set).toHaveBeenCalledWith({ quantity: 0 })
    expect(where).toHaveBeenCalledOnce()
  })

  it('moves stock only to a household-owned custom place', async () => {
    placeFindFirst.mockResolvedValue(null)
    await expect(updatePantryItemForHousehold(householdId, itemId, { placeKey: `custom:${placeId}` })).rejects.toBeInstanceOf(PantryInputError)
    expect(update).not.toHaveBeenCalled()

    placeFindFirst.mockResolvedValue({ id: placeId })
    await updatePantryItemForHousehold(householdId, itemId, { placeKey: `custom:${placeId}` })
    expect(set).toHaveBeenCalledWith({ customPlaceId: placeId })
    expect(where).toHaveBeenCalledOnce()
  })

  it('moves stock to a valid fixed place and rejects malformed item IDs safely', async () => {
    await updatePantryItemForHousehold(householdId, itemId, { placeKey: 'Mrazák' })
    expect(set).toHaveBeenCalledWith({ location: 'Mrazák', customPlaceId: null })

    await expect(updatePantryItemForHousehold(householdId, 'not-a-uuid', { quantity: 1 })).rejects.toBeInstanceOf(PantryResourceNotFoundError)
  })
})
