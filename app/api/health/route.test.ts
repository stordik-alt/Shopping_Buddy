import { describe, expect, it } from 'vitest'

import { GET } from '@/app/api/health/route'

describe('GET /api/health', () => {
  it('answers 200 ok without requiring the database', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })
})
