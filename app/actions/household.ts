'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
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
