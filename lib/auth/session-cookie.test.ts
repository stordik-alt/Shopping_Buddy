import { describe, expect, it } from 'vitest'
import { isCookieWriteDuringRenderError, mayHaveNeonSession } from '@/lib/auth/session-cookie'

describe('mayHaveNeonSession', () => {
  it('is true only with the Neon Auth session-token cookie', () => {
    expect(mayHaveNeonSession(['__Secure-neon-auth.session_token', 'theme'])).toBe(true)
    expect(mayHaveNeonSession(['__Secure-neon-auth.local.session_data'])).toBe(false)
    expect(mayHaveNeonSession([])).toBe(false)
  })
})

describe('isCookieWriteDuringRenderError', () => {
  it('recognises only Next.js error E1180', () => {
    const cookieError = Object.assign(new Error('Cookies can only be modified in a Server Action or Route Handler.'), { __NEXT_ERROR_CODE: 'E1180' })
    expect(isCookieWriteDuringRenderError(cookieError)).toBe(true)
    expect(isCookieWriteDuringRenderError(Object.assign(new Error('x'), { __NEXT_ERROR_CODE: 'E1' }))).toBe(false)
    expect(isCookieWriteDuringRenderError(new Error('boom'))).toBe(false)
    expect(isCookieWriteDuringRenderError(null)).toBe(false)
    expect(isCookieWriteDuringRenderError('E1180')).toBe(false)
  })
})
