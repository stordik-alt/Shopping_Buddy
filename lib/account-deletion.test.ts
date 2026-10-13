import { describe, expect, it } from 'vitest'
import { confirmsEmail, planAccountDeletion } from '@/lib/account-deletion'

describe('planAccountDeletion', () => {
  it('lets a member leave', () => expect(planAccountDeletion('member', 3)).toBe('leave'))
  it('deletes the household of a lone owner', () => expect(planAccountDeletion('owner', 0)).toBe('delete'))
  it('blocks an owner while other accounts remain', () => expect(planAccountDeletion('owner', 1)).toBe('blocked'))
})

describe('confirmsEmail', () => {
  it('accepts the own e-mail regardless of case and spaces', () => expect(confirmsEmail('  Jana@Example.cz ', 'jana@example.cz')).toBe(true))
  it('rejects another e-mail and an empty one', () => {
    expect(confirmsEmail('x@example.cz', 'jana@example.cz')).toBe(false)
    expect(confirmsEmail('', '')).toBe(false)
  })
})
