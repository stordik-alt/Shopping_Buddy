import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/cron/retention/route'

describe('GET /api/cron/retention', () => {
  it('refuses a request without the cron secret', async () => {
    process.env.CRON_SECRET = 'test-secret'
    const response = await GET(new Request('http://localhost/api/cron/retention'))
    expect(response.status).toBe(401)
  })
})
