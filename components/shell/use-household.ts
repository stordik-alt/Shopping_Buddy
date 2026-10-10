'use client'

import { useEffect, useState } from 'react'
import {
  addChildAction,
  addHouseholdMemberAction,
  inviteMemberAction,
  removeChildAction,
  removeHouseholdMemberAction,
  setMemberDietAction,
  revokeInvitationAction,
  updateHouseholdAction,
  updateHouseholdPreferencesAction,
} from '@/app/actions/household'
import type { PeriodConfig } from '@/lib/budget-period'
import type { HouseholdData } from '@/lib/db/queries'
import type { MemberDiet } from '@/lib/diet'

type Household = HouseholdData['household']

/** The household profile (members, children, preferences, budget settings) and its invitations. */
export function useHousehold(initialData: HouseholdData) {
  const [household, setHousehold] = useState(initialData.household)
  const [pendingInvitations, setPendingInvitations] = useState(initialData.pendingInvitations)

  useEffect(() => {
    setHousehold(initialData.household)
    setPendingInvitations(initialData.pendingInvitations)
  }, [initialData])

  function updateHousehold(changes: { name?: string; monthlyBudget?: number }) {
    setHousehold((current) => ({ ...current, ...changes }))
    updateHouseholdAction(changes)
  }

  /** Switches the budget period (docs/15 §3). Unlike the other settings it is saved first and shown
   *  after, because it re-slices every number on the budget screens: a refused change must not leave
   *  the page showing a period the server does not have. Rejects with the server's message. */
  async function updateBudgetPeriod(period: PeriodConfig) {
    await updateHouseholdAction({ budgetPeriod: period })
    setHousehold((current) => ({
      ...current,
      budgetPeriod: period,
      // A custom period does not use the start day, so it keeps its last value (as on the server).
      budgetPeriodStartDay: period.type === 'calendar' ? 1 : period.type === 'payday' ? period.startDay : current.budgetPeriodStartDay,
    }))
  }

  async function addMember(member: { name: string; age: number; favoriteFoods: string[]; dislikedFoods: string[]; allergies: string[] }) {
    const created = await addHouseholdMemberAction(member)
    setHousehold((current) => ({ ...current, members: [...current.members, created] }))
  }

  function removeMember(id: string) {
    setHousehold((current) => ({ ...current, members: current.members.filter((member) => member.id !== id) }))
    removeHouseholdMemberAction(id)
  }

  async function setMemberDiet(id: string, answers: MemberDiet) {
    const saved = await setMemberDietAction(id, answers)
    setHousehold((current) => ({ ...current, members: current.members.map((member) => (member.id === id ? { ...member, diet: saved } : member)) }))
  }

  async function addChild(child: { name: string; age: number; preferences: string; specialNeeds?: string }) {
    const created = await addChildAction(child)
    setHousehold((current) => ({ ...current, children: [...current.children, created] }))
  }

  function removeChild(id: string) {
    setHousehold((current) => ({ ...current, children: current.children.filter((child) => child.id !== id) }))
    removeChildAction(id)
  }

  function updatePreferences(changes: Partial<Household['preferences']>) {
    setHousehold((current) => ({ ...current, preferences: { ...current.preferences, ...changes } }))
    updateHouseholdPreferencesAction(changes)
  }

  async function inviteMember(email: string) {
    const invitation = await inviteMemberAction(email)
    setPendingInvitations((current) => [...current, { id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt }])
    return invitation
  }

  function revokeInvitation(id: string) {
    setPendingInvitations((current) => current.filter((invitation) => invitation.id !== id))
    revokeInvitationAction(id)
  }

  return { household, pendingInvitations, updateHousehold, updateBudgetPeriod, addMember, removeMember, setMemberDiet, addChild, removeChild, updatePreferences, inviteMember, revokeInvitation }
}
