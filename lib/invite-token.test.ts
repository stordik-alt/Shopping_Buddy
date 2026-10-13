import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { safeInviteToken } from '@/lib/invite-token'

describe('safeInviteToken', () => {
  it('keeps a token as the invitation action generates it', () => {
    const token = randomBytes(24).toString('base64url')
    expect(safeInviteToken(token)).toBe(token)
  })

  it.each([null, '', 'short', '../../auth/sign-in', 'a'.repeat(20) + '/x', 'a'.repeat(20) + '?x=1', 'a'.repeat(20) + '<script>', 'a'.repeat(300)])('drops %j', (value) => {
    expect(safeInviteToken(value)).toBeNull()
  })
})
