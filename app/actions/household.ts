'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { Child, HouseholdMember, HouseholdPreferences, PriceSensitivity, QualityPreference } from '@/lib/types'

export async function updateHouseholdAction(householdId: string, changes: { name?: string; monthlyBudget?: number }) {
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

export async function addHouseholdMemberAction(
  householdId: string,
  member: { name: string; age: number; favoriteFoods: string[]; dislikedFoods: string[]; allergies: string[] },
): Promise<HouseholdMember> {
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
  const db = getDb()
  await db.delete(schema.householdMembers).where(eq(schema.householdMembers.id, memberId))
  revalidatePath('/')
}

export async function addChildAction(
  householdId: string,
  child: { name: string; age: number; preferences: string; specialNeeds?: string },
): Promise<Child> {
  const db = getDb()
  const [row] = await db
    .insert(schema.children)
    .values({ householdId, name: child.name, age: child.age, preferences: child.preferences, specialNeeds: child.specialNeeds || null })
    .returning()
  revalidatePath('/')
  return { id: row.id, name: row.name, age: row.age, preferences: row.preferences, specialNeeds: row.specialNeeds ?? undefined }
}

export async function removeChildAction(childId: string) {
  const db = getDb()
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

export async function updateHouseholdPreferencesAction(householdId: string, changes: Partial<HouseholdPreferences>) {
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
