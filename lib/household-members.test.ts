import { describe, expect, it } from 'vitest'
import { canRemoveMember } from '@/lib/household-members'

const owner = { role: 'owner' as const, memberId: 'owner-1' }
const member = { role: 'member' as const, memberId: 'member-1' }

describe('canRemoveMember', () => {
  it('never lets the owner be removed, not even by themselves', () => {
    expect(canRemoveMember(member, { id: 'owner-1', role: 'owner', userId: 'u-owner' })).toBe(false)
    expect(canRemoveMember(owner, { id: 'owner-1', role: 'owner', userId: 'u-owner' })).toBe(false)
  })
  it('lets the owner remove any other member', () => {
    expect(canRemoveMember(owner, { id: 'member-2', role: 'member', userId: 'u-2' })).toBe(true)
    expect(canRemoveMember(owner, { id: 'profile-1', role: 'member', userId: null })).toBe(true)
  })
  it('lets a member remove only themselves or a profile without an account', () => {
    expect(canRemoveMember(member, { id: 'member-1', role: 'member', userId: 'u-1' })).toBe(true)
    expect(canRemoveMember(member, { id: 'profile-1', role: 'member', userId: null })).toBe(true)
    expect(canRemoveMember(member, { id: 'member-2', role: 'member', userId: 'u-2' })).toBe(false)
  })
})
