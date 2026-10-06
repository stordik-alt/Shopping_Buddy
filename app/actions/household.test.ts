describe('input hardening', () => {
  it('rejects malformed email invitations', async () => {
    currentHousehold = { householdId, role: 'owner', userId: crypto.randomUUID() }
    await expect(inviteMemberAction('not-an-email')).rejects.toThrow('Invalid email address')
  })

  it('rejects empty or oversized names before writing', async () => {
    currentHousehold = { householdId, role: 'owner', userId: crypto.randomUUID() }
    await expect(updateHouseholdAction({ name: '' })).rejects.toThrow('name is required')
    await expect(updateHouseholdAction({ name: 'x'.repeat(5000) })).rejects.toThrow('name is too long')
  })
})
