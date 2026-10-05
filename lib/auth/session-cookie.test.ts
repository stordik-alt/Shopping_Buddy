import { describe, expect, it } from 'vitest'
import { mayHaveNeonSession } from '@/lib/auth/session-cookie'

describe('mayHaveNeonSession', () => {
  it('is true only with the Neon Auth session-token cookie', () => {
    expect(mayHaveNeonSession(['__Secure-neon-auth.session_token', 'theme'])).toBe(true)
    expect(mayHaveNeonSession(['__Secure-neon-auth.local.session_data'])).toBe(false)
    expect(mayHaveNeonSession([])).toBe(false)
  })
})
