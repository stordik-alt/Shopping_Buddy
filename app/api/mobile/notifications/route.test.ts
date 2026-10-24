import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const getDb = vi.fn()
const findMany = vi.fn()
const preferencesWhere = vi.fn()
const deleteWhere = vi.fn()
const notificationRows = [
  { id: 'n1', title: 'Rozpočet', detail: 'Blížíte se limitu.', unread: true, kind: 'budget' },
  { id: 'n2', title: 'Domácnost', detail: 'Nový člen.', unread: true, kind: 'household' },
]
vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/client', () => ({ getDb: () => getDb() }))

import { DELETE, GET } from '@/app/api/mobile/notifications/route'

describe('mobile notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'member' })
    findMany.mockResolvedValue(notificationRows)
    preferencesWhere.mockResolvedValue([{ kind: 'budget' }])
    deleteWhere.mockResolvedValue(undefined)
    getDb.mockReturnValue({
      query: { notifications: { findMany: (...args: unknown[]) => findMany(...args) } },
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: (...args: unknown[]) => preferencesWhere(...args) })) })),
      delete: vi.fn(() => ({ where: (...args: unknown[]) => deleteWhere(...args) })),
    })
  })

  it('returns only unread notifications whose kind the member enabled', async () => {
    const response = await GET(new Request('https://anitka.example/api/mobile/notifications'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ notifications: [notificationRows[1]] })
  })

  it('deletes one notification or all notifications only within the member household', async () => {
    const one = await DELETE(new Request('https://anitka.example/api/mobile/notifications?id=n1', { method: 'DELETE' }))
    expect(one.status).toBe(200)
    expect(deleteWhere).toHaveBeenCalledTimes(1)
    const all = await DELETE(new Request('https://anitka.example/api/mobile/notifications', { method: 'DELETE' }))
    expect(all.status).toBe(200)
    expect(deleteWhere).toHaveBeenCalledTimes(2)
  })
})
