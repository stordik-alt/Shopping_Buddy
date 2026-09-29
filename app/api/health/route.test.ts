import { beforeEach, describe, expect, it, vi } from 'vitest'

// The database is faked: the route only cares whether `select 1` resolves or throws.
const execute = vi.fn()
vi.mock('@/lib/db/client', () => ({ getDb: () => ({ execute }) }))

import { GET } from '@/app/api/health/route'

describe('GET /api/health', () => {
  beforeEach(() => {
    execute.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('answers 200 ok when the database responds', async () => {
    execute.mockResolvedValue({ rows: [] })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('answers 503 without leaking the reason when the database fails', async () => {
    execute.mockRejectedValue(new Error('password authentication failed for user "secret_user"'))
    const response = await GET()
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toEqual({ status: 'unavailable' })
    expect(JSON.stringify(body)).not.toContain('secret_user')
  })
})
