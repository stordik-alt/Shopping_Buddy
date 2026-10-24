import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const pushToHousehold = vi.fn()
vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/push/deliver', () => ({ pushToHousehold: (...args: unknown[]) => pushToHousehold(...args) }))

import { POST } from '@/app/api/mobile/push-subscription/test/route'

describe('mobile test push notification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'member' })
    pushToHousehold.mockResolvedValue({ sent: 1, removed: 0, failed: 0 })
  })

  it('sends the test only to the signed-in member devices', async () => {
    const response = await POST(new Request('https://anitka.example/api/mobile/push-subscription/test', { method: 'POST' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(pushToHousehold).toHaveBeenCalledWith('household-1', expect.objectContaining({ title: 'ANITKA' }), { onlyUserId: 'user-1' })
  })

  it('reports when no device receives the test notification', async () => {
    pushToHousehold.mockResolvedValue({ sent: 0, removed: 0, failed: 1 })
    const response = await POST(new Request('https://anitka.example/api/mobile/push-subscription/test', { method: 'POST' }))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'push_not_delivered' })
  })
})
