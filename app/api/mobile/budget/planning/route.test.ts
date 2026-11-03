import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileUserFromRequest = vi.fn()
const mobileHouseholdForUser = vi.fn()
const getDb = vi.fn()
const recordAudit = vi.fn()

vi.mock('@/lib/auth/mobile-request', async (original) => ({
  ...(await original<typeof import('@/lib/auth/mobile-request')>()),
  mobileUserFromRequest: (...args: unknown[]) => mobileUserFromRequest(...args),
  mobileHouseholdForUser: (...args: unknown[]) => mobileHouseholdForUser(...args),
}))
vi.mock('@/lib/db/client', () => ({ getDb: () => getDb() }))
vi.mock('@/lib/db/audit', () => ({ recordAudit: (...args: unknown[]) => recordAudit(...args) }))
vi.mock('@/lib/today', () => ({ todayInPrague: () => '2026-11-02' }))

import { PATCH } from '@/app/api/mobile/budget/planning/route'

const household = {
  id: 'household-1',
  monthlyBudget: '10000',
  currency: 'CZK',
  savingsGoal: '500',
  budgetPeriodType: 'calendar',
  budgetPeriodStartDay: 1,
  budgetPeriodAnchor: null,
  budgetPeriodLengthDays: null,
}

const request = (body: unknown) => new Request('https://anitka.example/api/mobile/budget/planning', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('/api/mobile/budget/planning PATCH', () => {
  const updateWhere = vi.fn()
  const deleteWhere = vi.fn()
  const set = vi.fn(() => ({ where: updateWhere }))
  const onConflictDoUpdate = vi.fn()
  const values = vi.fn(() => ({ onConflictDoUpdate }))

  beforeEach(() => {
    vi.clearAllMocks()
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'owner' })
    updateWhere.mockResolvedValue(undefined)
    deleteWhere.mockResolvedValue(undefined)
    onConflictDoUpdate.mockResolvedValue(undefined)
    recordAudit.mockResolvedValue(undefined)
    const households = vi.fn()
      .mockResolvedValueOnce(household)
      .mockResolvedValueOnce({ ...household, monthlyBudget: '12500', savingsGoal: '750' })
    getDb.mockReturnValue({
      query: {
        households: { findFirst: households },
        budgets: { findMany: vi.fn().mockResolvedValue([{ month: '2026-11-01', amount: '12000' }]) },
      },
      update: vi.fn(() => ({ set })),
      insert: vi.fn(() => ({ values })),
      delete: vi.fn(() => ({ where: deleteWhere })),
    })
  })

  it('saves the default budget, period budgets and savings goal for the owner', async () => {
    const response = await PATCH(request({
      defaultBudget: 12500,
      savingsGoal: 750,
      periodBudgets: [{ period: '2026-11-01', amount: 12000 }],
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({
      budget: 12000,
      defaultBudget: 12500,
      periodBudgets: { '2026-11-01': 12000 },
      savingsGoal: 750,
      canSetDefault: true,
    })
    expect(set).toHaveBeenCalledWith({ monthlyBudget: '12500' })
    expect(set).toHaveBeenCalledWith({ savingsGoal: '750' })
    expect(values).toHaveBeenCalledWith({ householdId: 'household-1', month: '2026-11-01', amount: '12000' })
    expect(recordAudit).toHaveBeenCalledWith(
      { householdId: 'household-1', memberId: 'member-1' },
      'budget.period_set',
      { period: '2026-11-01', amount: 12000 },
    )
  })

  it('lets a member edit period budgets but not the household default', async () => {
    mobileHouseholdForUser.mockResolvedValue({ id: 'member-1', householdId: 'household-1', role: 'member' })

    const denied = await PATCH(request({ defaultBudget: 15000 }))
    expect(denied.status).toBe(403)
    expect(getDb).not.toHaveBeenCalled()

    const response = await PATCH(request({ periodBudgets: [{ period: '2026-12-01', amount: null }] }))
    expect(response.status).toBe(200)
    expect(deleteWhere).toHaveBeenCalled()
  })

  it('rejects periods outside the current and next budget period', async () => {
    const response = await PATCH(request({ periodBudgets: [{ period: '2027-01-01', amount: 1000 }] }))
    expect(response.status).toBe(400)
    expect(set).not.toHaveBeenCalled()
    expect(values).not.toHaveBeenCalled()
  })
})
