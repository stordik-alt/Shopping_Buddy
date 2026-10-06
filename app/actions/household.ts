'use server'

import { cleanMemberDiet, type MemberDiet } from '@/lib/diet'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { requireHousehold, requireHouseholdId } from '@/lib/auth/authorize'
import { auth } from '@/lib/auth/server'
import { isValidPeriodStartDay, MAX_PERIOD_START_DAY } from '@/lib/budget'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { joinHouseholdViaInvitation } from '@/lib/db/queries'
import { checkInviteRateLimit } from '@/lib/rate-limit'
import type { Child, HouseholdMember, HouseholdPreferences, PriceSensitivity, QualityPreference } from '@/lib/types'

const MAX_NAME_LEN = 120
const MAX_EMAIL_LEN = 254
const MAX_TEXT_FIELD_LEN = 1000

function assertSafeText(value: unknown, field: string, maxLen = MAX_TEXT_FIELD_LEN): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${field} is required`)
  if (trimmed.length > maxLen) throw new Error(`${field} is too long`)
  return trimmed
}

function assertSafeEmail(value: unknown): string {
  const email = assertSafeText(value, 'email', MAX_EMAIL_LEN).toLowerCase()
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  if (!isValid) throw new Error('Invalid email address')
  return email
}

function assertSafeNumber(value: unknown, field: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a valid number`)
  }
  if (integer && !Number.isInteger(value)) {
    throw new Error(`${field} must be an integer`)
  }
  if (value < min || value > max) {
    throw new Error(`${field} is outside the allowed range`)
  }
  return value
}

function sanitizeStringArray(values: unknown, field: string): string[] {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array`)
  return values
    .map((item, index) => {
      if (typeof item !== 'string') throw new Error(`${field}[${index}] must be a string`)
      const safe = item.trim()
      if (!safe) return ''
      if (safe.length > MAX_TEXT_FIELD_LEN) throw new Error(`${field}[${index}] is too long`)
      return safe
    })
    .filter(Boolean)
}

export async function updateHouseholdAction(changes: { name?: string; monthlyBudget?: number; budgetPeriodStartDay?: number }) {
  const householdId = await requireHouseholdId()

  const safeName = changes.name !== undefined ? assertSafeText(changes.name, 'name', MAX_NAME_LEN) : undefined
  const safeMonthlyBudget = changes.monthlyBudget !== undefined
    ? assertSafeNumber(changes.monthlyBudget, 'monthlyBudget', 0, 100000000, false)
    : undefined

  const safeBudgetPeriodStartDay = changes.budgetPeriodStartDay != null
    ? assertSafeNumber(changes.budgetPeriodStartDay, 'budgetPeriodStartDay', 1, MAX_PERIOD_START_DAY, true)
    : undefined

  if (safeBudgetPeriodStartDay != null && !isValidPeriodStartDay(safeBudgetPeriodStartDay)) {
    throw new Error(`Rozpočtové období může začínat nejvýše ${MAX_PERIOD_START_DAY}. dnem v měsíci.`)
  }

  const db = getDb()
  await db
    .update(schema.households)
    .set({
      ...(safeName != null && { name: safeName }),
      ...(safeMonthlyBudget != null && { monthlyBudget: safeMonthlyBudget.toString() }),
      ...(safeBudgetPeriodStartDay != null && { budgetPeriodStartDay: safeBudgetPeriodStartDay }),
    })
    .where(eq(schema.households.id, householdId))
}

export async function addHouseholdMemberAction(member: {
  name: string
  age: number
  favoriteFoods: string[]
  dislikedFoods: string[]
  allergies: string[]
}): Promise<HouseholdMember> {
  const householdId = await requireHouseholdId()
  const safeName = assertSafeText(member.name, 'member.name', MAX_NAME_LEN)
  const safeAge = assertSafeNumber(member.age, 'member.age', 0, 120, true)
  const safeFavoriteFoods = sanitizeStringArray(member.favoriteFoods, 'favoriteFoods')
  const safeDislikedFoods = sanitizeStringArray(member.dislikedFoods, 'dislikedFoods')
  const safeAllergies = sanitizeStringArray(member.allergies, 'allergies')

  const db = getDb()
  const [memberRow] = await db.insert(schema.householdMembers).values({ householdId, name: safeName, role: 'member' }).returning()
  await db.insert(schema.profiles).values({
    memberId: memberRow.id,
    age: safeAge,
    favoriteFoods: safeFavoriteFoods,
    dislikedFoods: safeDislikedFoods,
    allergies: safeAllergies,
  })
  return {
    id: memberRow.id,
    name: memberRow.name,
    role: 'Člen domácnosti',
    age: safeAge,
    preferences: '',
    favoriteFoods: safeFavoriteFoods,
    dislikedFoods: safeDislikedFoods,
    allergies: safeAllergies,
  }
}

export async function removeHouseholdMemberAction(memberId: string) {
  const householdId = await requireHouseholdId()
  const safeMemberId = assertSafeText(memberId, 'memberId', 128)
  const db = getDb()
  const member = await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.id, safeMemberId) })
  if (!member || member.householdId !== householdId) throw new Error('Household member not found')
  await db.delete(schema.householdMembers).where(eq(schema.householdMembers.id, safeMemberId))
}

export async function addChildAction(child: { name: string; age: number; preferences: string; specialNeeds?: string }): Promise<Child> {
  const householdId = await requireHouseholdId()
  const safeName = assertSafeText(child.name, 'child.name', MAX_NAME_LEN)
  const safeAge = assertSafeNumber(child.age, 'child.age', 0, 21, true)
  const safePreferences = assertSafeText(child.preferences, 'child.preferences', MAX_TEXT_FIELD_LEN)
  const safeSpecialNeeds = child.specialNeeds != null ? assertSafeText(child.specialNeeds, 'child.specialNeeds', MAX_TEXT_FIELD_LEN) : null

  const db = getDb()
  const [row] = await db
    .insert(schema.children)
    .values({ householdId, name: safeName, age: safeAge, preferences: safePreferences, specialNeeds: safeSpecialNeeds })
    .returning()
  return { id: row.id, name: row.name, age: row.age, preferences: row.preferences, specialNeeds: row.specialNeeds ?? undefined }
}

export async function removeChildAction(childId: string) {
  const householdId = await requireHouseholdId()
  const safeChildId = assertSafeText(childId, 'childId', 128)
  const db = getDb()
  const child = await db.query.children.findFirst({ where: eq(schema.children.id, safeChildId) })
  if (!child || child.householdId !== householdId) throw new Error('Child not found')
  await db.delete(schema.children).where(eq(schema.children.id, safeChildId))
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
}

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function inviteMemberAction(email: string): Promise<{ id: string; token: string; email: string; expiresAt: string }> {
  const { householdId, role, userId } = await requireHousehold()
  if (role !== 'owner') throw new Error('Jen správce domácnosti může zvát nové členy.')
  checkInviteRateLimit(`${householdId}:${userId}`)

  const safeEmail = assertSafeEmail(email)
  const db = getDb()

  const inviterMember = await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.userId, userId) })
  const token = randomBytes(24).toString('base64url')
  const [invitation] = await db
    .insert(schema.invitations)
    .values({
      householdId,
      email: safeEmail,
      token,
      invitedByMemberId: inviterMember?.id,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    })
    .returning()
  return { id: invitation.id, token, email: invitation.email, expiresAt: invitation.expiresAt.toString() }
}

export async function revokeInvitationAction(invitationId: string) {
  const { householdId, role } = await requireHousehold()
  if (role !== 'owner') throw new Error('Jen správce domácnosti může rušit pozvánky.')
  const safeInvitationId = assertSafeText(invitationId, 'invitationId', 128)
  const db = getDb()
  const invitation = await db.query.invitations.findFirst({ where: eq(schema.invitations.id, safeInvitationId) })
  if (!invitation || invitation.householdId !== householdId) throw new Error('Pozvánka nenalezena')
  await db.update(schema.invitations).set({ status: 'revoked' }).where(eq(schema.invitations.id, safeInvitationId))
}

export async function acceptInvitationAction(token: string) {
  const { data: session } = await auth.getSession()
  if (!session?.user) throw new Error('Nejste přihlášeni.')
  const safeToken = assertSafeText(token, 'token', 256)
  const db = getDb()

  const invitation = await db.query.invitations.findFirst({ where: eq(schema.invitations.token, safeToken) })
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

export async function setMemberDietAction(memberId: string, answers: { diet: string; avoids: string[] }): Promise<MemberDiet> {
  const householdId = await requireHouseholdId()
  const safeMemberId = assertSafeText(memberId, 'memberId', 128)
  const db = getDb()
  const member = await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.id, safeMemberId), columns: { householdId: true } })
  if (!member || member.householdId !== householdId) throw new Error('Household member not found')
  const diet = cleanMemberDiet(answers)
  if (!diet) throw new Error('Neplatné odpovědi dotazníku.')
  await db
    .insert(schema.memberDiets)
    .values({ memberId: safeMemberId, diet: diet.diet, avoids: diet.avoids })
    .onConflictDoUpdate({ target: schema.memberDiets.memberId, set: { diet: diet.diet, avoids: diet.avoids, updatedAt: new Date() } })
  return diet
}

