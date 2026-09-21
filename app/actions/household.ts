'use server'

import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHousehold, requireHouseholdId } from '@/lib/auth/authorize'
import { auth } from '@/lib/auth/server'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { joinHouseholdViaInvitation } from '@/lib/db/queries'
import type { Child, HouseholdMember, HouseholdPreferences, PriceSensitivity, QualityPreference } from '@/lib/types'

export async function updateHouseholdAction(changes: { name?: string; monthlyBudget?: number }) {
  const householdId = await requireHouseholdId()
  const db = getDb()
  await db
    .update(schema.households)
    .set({
      ...(changes.name != null && { name: changes.name }),
      ...(changes.monthlyBudget != null && { monthlyBudget: changes.monthlyBudget.toString() }),
    })
    .where(eq(schema.households.id, householdId))
  revalidatePath('/')
}

export async function addHouseholdMemberAction(member: {
  name: string
  age: number
  favoriteFoods: string[]
  dislikedFoods: string[]
  allergies: string[]
}): Promise<HouseholdMember> {
  const householdId = await requireHouseholdId()
  const db = getDb()
  const [memberRow] = await db.insert(schema.householdMembers).values({ householdId, name: member.name, role: 'member' }).returning()
  await db.insert(schema.profiles).values({
    memberId: memberRow.id,
    age: member.age,
    favoriteFoods: member.favoriteFoods,
    dislikedFoods: member.dislikedFoods,
    allergies: member.allergies,
  })
  revalidatePath('/')
  return {
    id: memberRow.id,
    name: memberRow.name,
    role: 'Člen domácnosti',
    age: member.age,
    preferences: '',
    favoriteFoods: member.favoriteFoods,
    dislikedFoods: member.dislikedFoods,
    allergies: member.allergies,
  }
}

export async function removeHouseholdMemberAction(memberId: string) {
  const householdId = await requireHouseholdId()
  const db = getDb()
  const member = await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.id, memberId) })
  if (!member || member.householdId !== householdId) throw new Error('Household member not found')
  await db.delete(schema.householdMembers).where(eq(schema.householdMembers.id, memberId))
  revalidatePath('/')
}

export async function addChildAction(child: { name: string; age: number; preferences: string; specialNeeds?: string }): Promise<Child> {
  const householdId = await requireHouseholdId()
  const db = getDb()
  const [row] = await db
    .insert(schema.children)
    .values({ householdId, name: child.name, age: child.age, preferences: child.preferences, specialNeeds: child.specialNeeds || null })
    .returning()
  revalidatePath('/')
  return { id: row.id, name: row.name, age: row.age, preferences: row.preferences, specialNeeds: row.specialNeeds ?? undefined }
}

export async function removeChildAction(childId: string) {
  const householdId = await requireHouseholdId()
  const db = getDb()
  const child = await db.query.children.findFirst({ where: eq(schema.children.id, childId) })
  if (!child || child.householdId !== householdId) throw new Error('Child not found')
  await db.delete(schema.children).where(eq(schema.children.id, childId))
  revalidatePath('/')
}

const PRICE_SENSITIVITY_VALUE: Record<PriceSensitivity, 'cheapest' | 'balanced' | 'quality_first'> = {
  Nejlevnější: 'cheapest',
  Vyvážené: 'balanced',
  'Kvalita především': 'quality_first',
}

const QUALITY_PREFERENCE_VALUE: Record<QualityPreference, 'standard' | 'premium'> = {
  Standardní: 'standard',
  Prémiová: 'premium',
}

export async function updateHouseholdPreferencesAction(changes: Partial<HouseholdPreferences>) {
  const householdId = await requireHouseholdId()
  const db = getDb()
  await db
    .update(schema.preferences)
    .set({
      ...(changes.preferredBrands != null && { preferredBrands: changes.preferredBrands }),
      ...(changes.preferredStores != null && { preferredStores: changes.preferredStores }),
      ...(changes.preferredProducts != null && { preferredProducts: changes.preferredProducts }),
      ...(changes.excludedProducts != null && { excludedProducts: changes.excludedProducts }),
      ...(changes.priceSensitivity != null && { priceSensitivity: PRICE_SENSITIVITY_VALUE[changes.priceSensitivity] }),
      ...(changes.qualityPreference != null && { qualityPreference: QUALITY_PREFERENCE_VALUE[changes.qualityPreference] }),
      ...(changes.preferCzechProducts != null && { preferCzechProducts: changes.preferCzechProducts }),
    })
    .where(eq(schema.preferences.householdId, householdId))
  revalidatePath('/')
}

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Creates a share-link invitation for the household. Only the owner may invite new members —
 *  enforced here server-side, per docs/02_ARCHITECTURE.md ("UI hiding is not security"). */
export async function inviteMemberAction(email: string): Promise<{ id: string; token: string; email: string; expiresAt: string }> {
  const { householdId, role, userId } = await requireHousehold()
  if (role !== 'owner') throw new Error('Jen správce domácnosti může zvát nové členy.')
  const db = getDb()
  const inviterMember = await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.userId, userId) })
  const token = randomBytes(24).toString('base64url')
  const [invitation] = await db
    .insert(schema.invitations)
    .values({
      householdId,
      email: email.toLowerCase().trim(),
      token,
      invitedByMemberId: inviterMember?.id,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    })
    .returning()
  revalidatePath('/')
  return { id: invitation.id, token, email: invitation.email, expiresAt: invitation.expiresAt.toString() }
}

export async function revokeInvitationAction(invitationId: string) {
  const { householdId, role } = await requireHousehold()
  if (role !== 'owner') throw new Error('Jen správce domácnosti může rušit pozvánky.')
  const db = getDb()
  const invitation = await db.query.invitations.findFirst({ where: eq(schema.invitations.id, invitationId) })
  if (!invitation || invitation.householdId !== householdId) throw new Error('Pozvánka nenalezena')
  await db.update(schema.invitations).set({ status: 'revoked' }).where(eq(schema.invitations.id, invitationId))
  revalidatePath('/')
}

/** Accepts a household invitation. Requires the signed-in account's email to match the invite,
 *  and that the account doesn't already belong to a household — this app supports one household
 *  per account for now, not membership in multiple households at once. */
export async function acceptInvitationAction(token: string) {
  const { data: session } = await auth.getSession()
  if (!session?.user) throw new Error('Nejste přihlášeni.')
  const db = getDb()

  const invitation = await db.query.invitations.findFirst({ where: eq(schema.invitations.token, token) })
  if (!invitation || invitation.status !== 'pending' || new Date(invitation.expiresAt) < new Date()) {
    throw new Error('Pozvánka je neplatná, už byla použita nebo jí vypršela platnost.')
  }
  if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
    throw new Error(`Tato pozvánka je určena pro e-mail ${invitation.email}.`)
  }
  const existingMember = await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.userId, session.user.id) })
  if (existingMember) {
    throw new Error('Už jste členem jiné domácnosti. Členství ve více domácnostech zatím není podporováno.')
  }

  await joinHouseholdViaInvitation(session.user.id, session.user.name, invitation)
}
